import { createApp } from "./app";

// Standalone entrypoint for the local Habitat REST backend.
//   bun run server
//
// Defaults to a localhost-only listener on port 8787. Both are overridable:
//   HABITAT_API_PORT=18787 bun run server
//   HABITAT_API_HOST=0.0.0.0 HABITAT_API_PORT=18787 bun run server
//
// Host semantics matter:
//   localhost / 127.0.0.1  accept requests only from this machine (safe default)
//   0.0.0.0                accept IPv4 from every interface, including Tailscale
// You never browse to http://0.0.0.0:PORT — 0.0.0.0 is a server-side listening
// instruction. Clients use localhost, the Tailscale IP, or the Tailscale name.
const DEFAULT_HOST = "localhost";
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

Bun.serve({
  fetch: app.fetch,
  hostname: host,
  port,
});

console.log(`[habitat-api] listening on http://${host}:${port}`);
