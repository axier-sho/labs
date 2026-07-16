import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isListening,
  readClockState,
  recordAppliedTick,
  setConnectionStatus,
  setListening,
} from "./state";
import {
  readRegistrationSync,
  writeRegistrationSync,
  type Registration,
} from "../kepler";
import { getDb } from "../db";

// The clock mode is the one setting that has to survive a backend restart, so
// these tests exercise the persistence layer directly: defaults, mode flips, and
// the round-trip of the stream credentials that authenticate the WebSocket.

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "habitat-clock-"));
  process.chdir(tempDir);
  // Force the migration to run against the fresh temp database.
  getDb();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

test("a fresh habitat defaults to manual mode with listening off", () => {
  const state = readClockState();

  expect(state.mode).toBe("manual");
  expect(state.listening).toBe(false);
  expect(state.connectionStatus).toBe("disconnected");
  expect(state.lastTick).toBeNull();
  expect(isListening()).toBe(false);
});

test("turning listening on saves Kepler mode before any connection", () => {
  setListening(true);

  const state = readClockState();
  expect(state.mode).toBe("kepler");
  expect(state.listening).toBe(true);
  expect(isListening()).toBe(true);
});

test("turning listening off returns to manual and clears the error view", () => {
  setListening(true);
  setConnectionStatus("error", "boom");
  expect(readClockState().lastError).toBe("boom");

  setListening(false);

  const state = readClockState();
  expect(state.mode).toBe("manual");
  expect(state.listening).toBe(false);
  expect(state.connectionStatus).toBe("disconnected");
  expect(state.lastError).toBeNull();
});

test("applied ticks persist the absolute tick and advancedBy together", () => {
  recordAppliedTick(900, 100);

  const state = readClockState();
  expect(state.lastTick).toBe(900);
  expect(state.lastAdvancedBy).toBe(100);
  expect(state.lastMessageAt).not.toBeNull();
});

test("registration round-trips the stream URL, token and metadata", () => {
  const registration: Registration = {
    habitatId: "habitat_test",
    habitatUuid: "00000000-0000-4000-8000-000000000000",
    displayName: "Test Habitat",
    baseUrl: "https://planet.example.com",
    registeredAt: "2026-07-15T00:00:00.000Z",
    streamUrl: "wss://planet.example.com/planet/stream",
    streamApiToken: "secret-stream-token",
    stream: {
      protocolVersion: "1.0",
      subscriptions: ["ticks"],
      currentTick: 800,
      ticksPerPulse: 1,
      tickIntervalMs: 1000,
      status: "running",
    },
  };

  writeRegistrationSync(registration);

  const stored = readRegistrationSync();
  expect(stored?.streamUrl).toBe(registration.streamUrl);
  expect(stored?.streamApiToken).toBe("secret-stream-token");
  expect(stored?.stream?.subscriptions).toEqual(["ticks"]);
  expect(stored?.stream?.currentTick).toBe(800);
  expect(stored?.stream?.status).toBe("running");
});

test("a registration saved without stream credentials reads back as legacy", () => {
  const legacy: Registration = {
    habitatId: "habitat_legacy",
    habitatUuid: "00000000-0000-4000-8000-000000000001",
    displayName: "Legacy Habitat",
    baseUrl: "https://planet.example.com",
    registeredAt: "2026-07-01T00:00:00.000Z",
    streamUrl: null,
    streamApiToken: null,
    stream: null,
  };

  writeRegistrationSync(legacy);

  const stored = readRegistrationSync();
  expect(stored?.streamUrl).toBeNull();
  expect(stored?.streamApiToken).toBeNull();
  expect(stored?.stream).toBeNull();
});
