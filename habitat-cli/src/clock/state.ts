import { getDb } from "../db";

// The clock mode is the authoritative "manual vs Kepler" setting. It lives in
// the single pinned clock_state row (id = 1) so the selected mode survives a
// backend or systemd restart: a restarted backend reads it and, if listening was
// on, reconnects to Kepler on its own. Everything except `mode`/`listening` is
// observability that `habitat clock status` surfaces.

export type ClockMode = "manual" | "kepler";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type ClockState = {
  mode: ClockMode;
  listening: boolean;
  connectionStatus: ConnectionStatus;
  // Most recent *absolute* Kepler tick applied while listening, and the
  // advancedBy amount that came with it. lastTick is what lets us ignore
  // duplicate or older notices without ever catching up on missed ones.
  lastTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

type ClockStateRow = {
  mode: ClockMode;
  listening: number;
  connectionStatus: ConnectionStatus;
  lastTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export function readClockState(): ClockState {
  const row = getDb()
    .query(
      "SELECT mode, listening, connectionStatus, lastTick, lastAdvancedBy, " +
        "lastConnectedAt, lastMessageAt, lastError, updatedAt " +
        "FROM clock_state WHERE id = 1",
    )
    .get() as ClockStateRow | null;

  // The migration seeds this row, so a missing row means the database has not
  // been opened yet; fall back to the documented default rather than throwing.
  if (row === null) {
    return {
      mode: "manual",
      listening: false,
      connectionStatus: "disconnected",
      lastTick: null,
      lastAdvancedBy: null,
      lastConnectedAt: null,
      lastMessageAt: null,
      lastError: null,
      updatedAt: null,
    };
  }

  return {
    mode: row.mode,
    listening: row.listening === 1,
    connectionStatus: row.connectionStatus,
    lastTick: row.lastTick,
    lastAdvancedBy: row.lastAdvancedBy,
    lastConnectedAt: row.lastConnectedAt,
    lastMessageAt: row.lastMessageAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

export function isListening(): boolean {
  return readClockState().listening;
}

// Persist the mode BEFORE the WebSocket is opened (on) or closed (off) so a
// manual tick can never race the connection: the moment `mode` reads 'kepler',
// manual ticks are rejected, even if the socket has not finished connecting yet.
export function setListening(listening: boolean): void {
  const now = new Date().toISOString();

  if (listening) {
    getDb().run(
      "UPDATE clock_state SET mode = 'kepler', listening = 1, updatedAt = ? WHERE id = 1",
      [now],
    );
    return;
  }

  // Returning to manual clears the transient connection view so a stale error or
  // "connected" state does not linger after the socket is gone.
  getDb().run(
    "UPDATE clock_state SET mode = 'manual', listening = 0, " +
      "connectionStatus = 'disconnected', lastError = NULL, updatedAt = ? WHERE id = 1",
    [now],
  );
}

export function setConnectionStatus(
  status: ConnectionStatus,
  error: string | null = null,
): void {
  const now = new Date().toISOString();

  if (status === "connected") {
    getDb().run(
      "UPDATE clock_state SET connectionStatus = 'connected', " +
        "lastConnectedAt = ?, lastError = NULL, updatedAt = ? WHERE id = 1",
      [now, now],
    );
    return;
  }

  if (status === "error") {
    getDb().run(
      "UPDATE clock_state SET connectionStatus = 'error', lastError = ?, updatedAt = ? WHERE id = 1",
      [error, now],
    );
    return;
  }

  getDb().run(
    "UPDATE clock_state SET connectionStatus = ?, updatedAt = ? WHERE id = 1",
    [status, now],
  );
}

// Record that a Kepler tick was received and applied to local state. Stored
// together (in one UPDATE) so the saved absolute tick can never drift from the
// advancedBy amount that was actually applied for it.
export function recordAppliedTick(tick: number, advancedBy: number): void {
  const now = new Date().toISOString();

  getDb().run(
    "UPDATE clock_state SET lastTick = ?, lastAdvancedBy = ?, " +
      "lastMessageAt = ?, updatedAt = ? WHERE id = 1",
    [tick, advancedBy, now, now],
  );
}

// A message arrived from Kepler (hello_ack, or a tick we chose to ignore).
// Advances lastMessageAt so `clock status` shows the link is alive even between
// applied ticks, without touching lastTick.
export function recordMessageAt(): void {
  const now = new Date().toISOString();

  getDb().run(
    "UPDATE clock_state SET lastMessageAt = ?, updatedAt = ? WHERE id = 1",
    [now, now],
  );
}
