import { readRegistrationSync, type Registration } from "../kepler";
import { runPowerTicks } from "../tick";
import {
  isListening,
  readClockState,
  recordAppliedTick,
  recordMessageAt,
  setConnectionStatus,
  setListening,
} from "./state";

// The Kepler live-clock WebSocket client. The long-running Hono backend owns
// exactly one of these — never the CLI or the browser dashboard, which stay
// clients of the local Habitat REST API. Keeping the socket here means the
// authenticated connection, the habitat-specific token, and the tick-apply rule
// all live in one process that outlives any single CLI command.
//
// It connects only while listening is on, authenticates with the saved
// stream token, applies each future planet_tick's full advancedBy through the
// same simulation used by manual ticks, and reconnects after an unexpected
// drop — without ever catching up on ticks missed while it was away.

const RECONNECT_DELAY_MS = 3000;

// One local event broadcast per received planet_tick. This is what feeds the
// local GET /clock/events SSE stream. It deliberately carries no credential.
export type ClockEvent = {
  type: "planet_tick";
  tick: number;
  advancedBy: number;
  previousTick: number | null;
  issuedAt: string | null;
  applied: boolean;
  // Present when the notice was received but not applied (duplicate/older/invalid).
  reason: string | null;
  receivedAt: string;
};

type PlanetTickMessage = {
  type: "planet_tick";
  tick: number;
  advancedBy: number;
  previousTick?: number;
  issuedAt?: string;
};

class KeplerStreamClient {
  private socket: WebSocket | null = null;
  // What the operator asked for. Reconnects only happen while this is true.
  private desiredListening = false;
  // Set during an intentional stop so the close handler does not reconnect.
  private stopping = false;
  private helloAcked = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Serialises tick application so two fast notices apply in order and a
  // listen-off can await the tick currently being processed before returning to
  // manual mode.
  private applying: Promise<void> = Promise.resolve();
  private subscribers = new Set<(event: ClockEvent) => void>();

  // Turn listening on: save Kepler mode FIRST (so a manual tick cannot race the
  // connection) then open the socket. Returns immediately — the connection may
  // still be in progress, which `clock status` reports as "connecting".
  enable(): void {
    setListening(true);
    this.desiredListening = true;
    this.stopping = false;
    this.connect();
  }

  // Turn listening off: stop reconnecting, close the socket, finish any tick
  // already being applied, and only then return to manual mode so a manual tick
  // can never overlap an in-flight Kepler tick.
  async disable(): Promise<void> {
    this.desiredListening = false;
    this.stopping = true;
    this.clearReconnectTimer();
    this.teardownSocket();

    await this.applying;

    setListening(false);
    this.stopping = false;
  }

  // Called on backend startup. If the saved mode was Kepler, reconnect on our
  // own — no missed ticks are replayed, we simply resume from the next notice.
  resumeIfEnabled(): void {
    if (!isListening()) {
      return;
    }

    this.desiredListening = true;
    this.stopping = false;
    this.connect();
  }

  // Clean shutdown for process exit: drop the socket without flipping the saved
  // mode, so the next start resumes in the same mode.
  async shutdown(): Promise<void> {
    this.stopping = true;
    this.clearReconnectTimer();
    this.teardownSocket();
    await this.applying;
  }

  subscribe(listener: (event: ClockEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private connect(): void {
    const registration = readRegistrationSync();

    if (
      registration === null ||
      registration.streamUrl === null ||
      registration.streamApiToken === null
    ) {
      // Nothing to connect to. Surface it and do NOT schedule a reconnect: a
      // missing token is fixed by (re-)registering, not by retrying.
      setConnectionStatus(
        "error",
        "No stream credentials saved. Register (or re-register) the habitat first.",
      );
      return;
    }

    this.clearReconnectTimer();
    this.teardownSocket();
    this.helloAcked = false;
    setConnectionStatus("connecting");
    // The stream URL carries no token (it is sent in the hello), so it is safe
    // to log — it shows the journal which endpoint the backend is dialling.
    console.log(`[habitat-clock] connecting to ${registration.streamUrl}`);

    let socket: WebSocket;
    try {
      // The token is never placed in the URL or query string; it is sent in the
      // hello message once the socket is open.
      socket = new WebSocket(registration.streamUrl);
    } catch (error) {
      setConnectionStatus("error", describeError(error));
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.addEventListener("open", () => {
      this.sendHello(socket, registration);
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("error", () => {
      // The browser-style WebSocket error event carries no useful detail; the
      // close event that follows drives the reconnect.
      setConnectionStatus("error", "WebSocket error.");
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.helloAcked = false;

      if (this.stopping || !this.desiredListening) {
        setConnectionStatus("disconnected");
        return;
      }

      // Unexpected drop: report it and reconnect after a delay. No catch-up.
      setConnectionStatus("disconnected");
      this.scheduleReconnect();
    });
  }

  private sendHello(socket: WebSocket, registration: Registration): void {
    const subscribe =
      registration.stream !== null &&
      registration.stream.subscriptions.length > 0
        ? registration.stream.subscriptions
        : ["ticks"];

    socket.send(
      JSON.stringify({
        type: "hello",
        apiToken: registration.streamApiToken,
        subscribe,
      }),
    );
  }

  private handleMessage(data: unknown): void {
    let message: { type?: unknown; habitatId?: unknown };
    try {
      message = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      // Malformed frame: ignore rather than crash the connection.
      return;
    }

    if (message.type === "hello_ack") {
      this.handleHelloAck(message);
      return;
    }

    if (message.type === "planet_tick") {
      // Only trust ticks after the server acknowledged our hello.
      if (!this.helloAcked) {
        return;
      }
      this.enqueuePlanetTick(message as unknown as PlanetTickMessage);
      return;
    }

    // Any other server message just proves the link is alive.
    recordMessageAt();
  }

  private handleHelloAck(message: { habitatId?: unknown }): void {
    const registration = readRegistrationSync();

    // The ack must be for *our* habitat. A mismatch means the token authorised a
    // different habitat than the one this backend owns; refuse to accept ticks.
    if (
      registration === null ||
      typeof message.habitatId !== "string" ||
      message.habitatId !== registration.habitatId
    ) {
      setConnectionStatus(
        "error",
        "Kepler hello_ack did not match this habitat's id.",
      );
      this.helloAcked = false;
      this.teardownSocket();
      return;
    }

    this.helloAcked = true;
    setConnectionStatus("connected");
    recordMessageAt();
    // Journal evidence: proves the backend connected and authenticated. The
    // token is never logged — only the habitatId the ack matched.
    console.log(
      `[habitat-clock] connected and authenticated (habitatId ${registration.habitatId})`,
    );
  }

  // Chain onto the apply queue so ticks apply strictly in arrival order and the
  // dedupe check sees the previous tick's committed lastTick.
  private enqueuePlanetTick(message: PlanetTickMessage): void {
    this.applying = this.applying.then(() => this.applyPlanetTick(message));
  }

  private async applyPlanetTick(message: PlanetTickMessage): Promise<void> {
    const tick = message.tick;
    const advancedBy = message.advancedBy;
    const previousTick =
      typeof message.previousTick === "number" ? message.previousTick : null;
    const issuedAt =
      typeof message.issuedAt === "string" ? message.issuedAt : null;

    const emit = (applied: boolean, reason: string | null) => {
      this.broadcast({
        type: "planet_tick",
        tick: typeof tick === "number" ? tick : Number.NaN,
        advancedBy: typeof advancedBy === "number" ? advancedBy : Number.NaN,
        previousTick,
        issuedAt,
        applied,
        reason,
        receivedAt: new Date().toISOString(),
      });
    };

    // A stop may have been requested after this tick was enqueued.
    if (this.stopping || !this.desiredListening) {
      emit(false, "listening stopped before this tick was applied");
      return;
    }

    if (typeof tick !== "number" || !Number.isInteger(tick)) {
      emit(false, "notice had no valid absolute tick");
      return;
    }

    if (!Number.isInteger(advancedBy) || advancedBy < 1) {
      // Guard the contract: advancedBy must be a positive whole number.
      emit(false, "advancedBy was not a positive whole number");
      recordMessageAt();
      return;
    }

    const lastTick = readClockState().lastTick;

    // Use the absolute tick to ignore duplicate or older notices. Missed ticks
    // are intentionally never requested or replayed.
    if (lastTick !== null && tick <= lastTick) {
      emit(false, "duplicate or older tick");
      recordMessageAt();
      return;
    }

    try {
      // The SAME shared simulation operation manual ticks use. advancedBy is the
      // number of local ticks to apply — 1, 10, 100 — never assumed to be 1.
      await runPowerTicks(advancedBy);
      recordAppliedTick(tick, advancedBy);
      // Journal evidence of an applied tick: absolute tick + advancedBy, no token.
      console.log(
        `[habitat-clock] applied planet_tick tick=${tick} advancedBy=${advancedBy}`,
      );
      emit(true, null);
    } catch (error) {
      emit(false, `failed to apply: ${describeError(error)}`);
    }
  }

  private broadcast(event: ClockEvent): void {
    for (const listener of this.subscribers) {
      try {
        listener(event);
      } catch {
        // A misbehaving subscriber must not take down the tick pipeline.
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.desiredListening) {
      return;
    }

    console.log(
      `[habitat-clock] disconnected; reconnecting in ${RECONNECT_DELAY_MS}ms (no missed ticks replayed)`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.desiredListening && !this.stopping) {
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    const socket = this.socket;
    if (socket === null) {
      return;
    }

    this.socket = null;
    try {
      socket.close();
    } catch {
      // Already closing/closed.
    }
  }
}

let client: KeplerStreamClient | null = null;

export function getKeplerStream(): KeplerStreamClient {
  if (client === null) {
    client = new KeplerStreamClient();
  }
  return client;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
