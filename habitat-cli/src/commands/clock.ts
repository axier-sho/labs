import type { Command } from "commander";
import { apiBaseUrl, apiGet, apiPost } from "../api-client";
import { reportError } from "../cli";

// The clock CLI is a thin client of the local Habitat backend. It never opens a
// WebSocket to Kepler itself — the backend owns that. `clock watch` reads the
// backend's local Server-Sent Events stream, so even the live tick view stays on
// the local API.

type ClockStatus = {
  mode: "manual" | "kepler";
  listening: boolean;
  manualTicksAllowed: boolean;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  lastTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type ClockEvent = {
  type: "planet_tick";
  tick: number;
  advancedBy: number;
  previousTick: number | null;
  issuedAt: string | null;
  applied: boolean;
  reason: string | null;
  receivedAt: string;
};

export function registerClockCommands(program: Command): void {
  const clock = program
    .command("clock")
    .description("Inspect and control the Kepler live-clock listener.");

  clock
    .command("status")
    .description("Show the clock mode, listening state, and Kepler connection.")
    .option("--json", "print the complete JSON response")
    .action(async (options: { json?: boolean }) => {
      try {
        const status = await apiGet<ClockStatus>("/clock/status");

        if (options.json === true) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        printClockStatus(status);
      } catch (error) {
        reportError(program, error);
      }
    });

  clock
    .command("listen")
    .description("Turn Kepler tick listening on or off.")
    .argument("<state>", "'on' to listen to Kepler, 'off' for manual ticks")
    .action(async (state: string) => {
      try {
        const listening = parseListenState(state);
        const status = await apiPost<ClockStatus>("/clock/listen", {
          listening,
        });

        console.log(
          listening
            ? "Listening to Kepler is now ON. Manual ticks are disabled."
            : "Listening to Kepler is now OFF. Manual ticks are available again.",
        );
        printClockStatus(status);
      } catch (error) {
        reportError(program, error);
      }
    });

  clock
    .command("watch")
    .description(
      "Stream future Kepler ticks received by the local backend (Ctrl+C to stop).",
    )
    .option("--jsonl", "emit one JSON object per event instead of text")
    .action(async (options: { jsonl?: boolean }, command: Command) => {
      // Honour both `habitat clock watch --jsonl` and `habitat --jsonl clock watch`.
      const jsonl =
        options.jsonl === true ||
        command.optsWithGlobals().jsonl === true;
      await watchClock(program, jsonl);
    });
}

function parseListenState(state: string): boolean {
  const value = state.trim().toLowerCase();

  if (value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  throw new Error("Listen state must be 'on' or 'off'.");
}

function printClockStatus(status: ClockStatus): void {
  console.log(`Clock mode: ${status.mode}`);
  console.log(`Kepler listening: ${status.listening ? "on" : "off"}`);
  console.log(
    `Manual ticks: ${status.manualTicksAllowed ? "allowed" : "disabled"}`,
  );
  console.log(`Connection: ${status.connectionStatus}`);
  console.log(
    `Last Kepler tick: ${
      status.lastTick === null
        ? "none yet"
        : `${status.lastTick}${
            status.lastAdvancedBy === null
              ? ""
              : ` (advancedBy ${status.lastAdvancedBy})`
          }`
    }`,
  );

  if (status.lastConnectedAt !== null) {
    console.log(`Last connected: ${status.lastConnectedAt}`);
  }

  if (status.lastMessageAt !== null) {
    console.log(`Last message: ${status.lastMessageAt}`);
  }

  if (status.lastError !== null) {
    console.log(`Last error: ${status.lastError}`);
  }
}

async function watchClock(program: Command, jsonl: boolean): Promise<void> {
  const url = `${apiBaseUrl()}/clock/events`;
  const controller = new AbortController();

  // Ctrl+C aborts only this watch loop, leaving the backend and its Kepler
  // listener running.
  const onInterrupt = () => {
    controller.abort();
  };
  process.on("SIGINT", onInterrupt);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
  } catch (error) {
    process.off("SIGINT", onInterrupt);
    if (controller.signal.aborted) {
      return;
    }
    reportError(
      program,
      new Error(
        `Could not reach the Habitat backend at ${apiBaseUrl()}.\n` +
          "Is it running? Start it with 'bun run server' in another terminal.\n" +
          `(${error instanceof Error ? error.message : String(error)})`,
      ),
    );
    return;
  }

  if (!response.ok || response.body === null) {
    process.off("SIGINT", onInterrupt);
    reportError(
      program,
      new Error(
        `Habitat backend GET /clock/events failed (${response.status} ${response.statusText}).`,
      ),
    );
    return;
  }

  if (!jsonl) {
    // Banner on stderr, tick lines on stdout: piping `--jsonl` output to another
    // program then yields a clean data-only stream, and the banner still shows.
    console.error(
      `Watching future Kepler ticks via ${apiBaseUrl()}. Press Ctrl+C to stop.`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        printEventFrame(frame, jsonl);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    // An abort is the normal way to stop; anything else is worth reporting.
    if (!controller.signal.aborted) {
      reportError(
        program,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  } finally {
    process.off("SIGINT", onInterrupt);
  }
}

// Pull the `data:` payload out of one SSE frame and print it. Frames without a
// data line (comments, heartbeats) are skipped.
function printEventFrame(frame: string, jsonl: boolean): void {
  const dataLines = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());

  if (dataLines.length === 0) {
    return;
  }

  const payload = dataLines.join("\n");

  if (payload.trim() === "") {
    return;
  }

  let event: ClockEvent;
  try {
    event = JSON.parse(payload) as ClockEvent;
  } catch {
    return;
  }

  console.log(formatClockEvent(event, jsonl));
}

// Render one received tick for `clock watch`. Shows the absolute tick and full
// advancedBy amount and whether the local backend applied it. The event never
// contains the stream token, so this can never print it.
export function formatClockEvent(event: ClockEvent, jsonl: boolean): string {
  if (jsonl) {
    return JSON.stringify(event);
  }

  const applied = event.applied
    ? `applied (+${event.advancedBy})`
    : `ignored (${event.reason ?? "not applied"})`;
  const issued = event.issuedAt !== null ? ` issued ${event.issuedAt}` : "";
  const previous =
    event.previousTick !== null ? ` prev ${event.previousTick}` : "";

  return `tick ${event.tick} advancedBy ${event.advancedBy} — ${applied}${previous}${issued}`;
}
