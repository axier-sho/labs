import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { getDb } from "../db";
import { setListening } from "../clock/state";

// The headline rule of the live-clock lab: manual ticks are allowed only while
// listening is off. These tests drive the real Hono app in-process (no network,
// no WebSocket) by toggling the persisted clock mode and hitting the routes.

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "habitat-clock-routes-"));
  process.chdir(tempDir);
  getDb();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

function postJson(path: string, body: unknown): Request {
  return new Request(`http://local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /clock/status reports the manual default", async () => {
  const app = createApp();

  const res = await app.request("/clock/status");
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    mode: string;
    listening: boolean;
    manualTicksAllowed: boolean;
  };
  expect(body.mode).toBe("manual");
  expect(body.listening).toBe(false);
  expect(body.manualTicksAllowed).toBe(true);
});

test("manual ticks are rejected with a helpful message while listening is on", async () => {
  const app = createApp();
  setListening(true);

  const res = await app.request(postJson("/ticks", { count: 1 }));
  expect(res.status).toBe(409);

  const body = (await res.json()) as { error: string };
  expect(body.error).toContain("Manual ticks are disabled");
  expect(body.error).toContain("clock listen off");
});

test("manual ticks succeed while listening is off", async () => {
  const app = createApp();
  setListening(false);

  const res = await app.request(postJson("/ticks", { count: 1 }));
  expect(res.status).toBe(200);

  const body = (await res.json()) as { summary: { ticks: number } };
  expect(body.summary.ticks).toBe(1);
});
