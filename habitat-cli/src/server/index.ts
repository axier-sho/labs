import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "hono/bun";
import { createApp } from "./app";
import { getKeplerStream } from "../clock/kepler-stream";
import { readClockState } from "../clock/state";

// Standalone entrypoint for the local Habitat REST backend.
//   bun run server
//
// Defaults to a localhost-only listener on port 8787. Both are overridable:
//   HABITAT_API_PORT=18787 bun run server
//   HABITAT_API_HOST=0.0.0.0 HABITAT_API_PORT=18787 bun run server
//
// Host semantics matter:
//   localhost / 127.0.0.1  accept requests only from this machine
//   0.0.0.0                accept IPv4 from every interface, including Tailscale
// You never browse to http://0.0.0.0:PORT — 0.0.0.0 is a server-side listening
// instruction. Clients use localhost, the Tailscale IP, or the Tailscale name.
// Default to 0.0.0.0 so a plain `bun run server` is reachable over Tailscale;
// override with HABITAT_API_HOST=localhost to restrict to this machine.
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8787;

function resolvePort(): number {
  const raw = process.env.HABITAT_API_PORT?.trim();

  if (raw === undefined || raw === "") {
    return DEFAULT_PORT;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `HABITAT_API_PORT must be an integer between 1 and 65535, got '${raw}'.`,
    );
  }

  return port;
}

function resolveHost(): string {
  const value = process.env.HABITAT_API_HOST?.trim();

  return value !== undefined && value !== "" ? value : DEFAULT_HOST;
}

const host = resolveHost();
const port = resolvePort();
const app = createApp();

// Serve the built web dashboard (habitat-cli/web) when a build exists. The API
// routes above take precedence; only unmatched paths fall through to static
// files. Kept out of createApp() so the API stays pure for tests.
const dashboardRoot = "./web/dist";
const dashboardAvailable = existsSync(join(process.cwd(), "web/dist/index.html"));

if (dashboardAvailable) {
  app.use("*", serveStatic({ root: dashboardRoot }));
  app.get("*", serveStatic({ path: join(dashboardRoot, "index.html") }));
}

Bun.serve({
  fetch: app.fetch,
  hostname: host,
  port,
});

console.log(`[habitat-api] listening on http://${host}:${port}`);
console.log(
  dashboardAvailable
    ? `[habitat-api] serving dashboard from ${dashboardRoot}`
    : "[habitat-api] no dashboard build found (run: bun run web:build)",
);

// The clock mode survives restarts because it is persisted. If the saved mode
// was Kepler, reconnect on our own — no ticks missed during the restart are
// replayed. If it was manual, this does nothing.
const savedClock = readClockState();
console.log(
  `[habitat-api] clock mode: ${savedClock.mode} (listening ${
    savedClock.listening ? "on" : "off"
  })`,
);
getKeplerStream().resumeIfEnabled();

// Drop the Kepler socket cleanly on shutdown without changing the saved mode, so
// the next start comes up in the same mode.
async function shutdown(signal: string): Promise<void> {
  console.log(`[habitat-api] ${signal} received, closing Kepler stream`);
  await getKeplerStream().shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
