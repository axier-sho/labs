import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateRegistration } from "./hydration";
import { listHabitatModules } from "./modules";
import { readHumansSync } from "./humans";
import { readAlertContractSync } from "./alerts";
import {
  readRegistration,
  type RegisterResponse,
  type Registration,
} from "./kepler";

// Registration hydration is the lab's headline transaction: a habitat either
// arrives registered, housed and crewed, or it does not arrive at all. These
// tests exist to prove that claim rather than to assert it in a comment.

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "habitat-hydration-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

const registration: Registration = {
  habitatId: "habitat_test",
  habitatUuid: "00000000-0000-4000-8000-000000000000",
  displayName: "Test Habitat",
  baseUrl: "https://planet.example.com",
  registeredAt: "2026-07-15T00:00:00.000Z",
};

function responseWith(
  starterHumans: RegisterResponse["starterHumans"],
): RegisterResponse {
  return {
    habitatId: "habitat_test",
    starterModules: [
      {
        id: "starter-command",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: { crewCapacity: 2 },
        capabilities: ["habitat-command"],
      },
      {
        id: "starter-suitport",
        blueprintId: "basic-suitport",
        displayName: "Basic Suitport",
        connectedTo: ["starter-command"],
        runtimeAttributes: { crewCapacity: 1 },
        capabilities: ["suitport-access"],
      },
    ],
    starterHumans,
    blueprints: [],
    contracts: { alerts: { schemaVersion: "1.0", schema: {} } },
  };
}

test("hydration persists the registration, modules and humans together", async () => {
  const summary = await hydrateRegistration({
    registration,
    response: responseWith([
      {
        id: "human-1",
        displayName: "Elizabeth",
        locationModuleId: "starter-command",
      },
      {
        id: "human-2",
        displayName: "Margaret",
        locationModuleId: "starter-suitport",
      },
    ]),
  });

  expect(summary.modulesHydrated).toBe(2);
  expect(summary.humansHydrated).toBe(2);
  expect(await readRegistration()).not.toBeNull();
  expect(await listHabitatModules()).toHaveLength(2);
  expect(readHumansSync()).toHaveLength(2);
  expect(readAlertContractSync()?.schemaVersion).toBe("1.0");
});

// Kepler numbers its starter modules; the habitat renames them. A human's
// locationModuleId has to follow that rename, or it points at nothing.
test("starter humans land in the renamed local module ids", async () => {
  await hydrateRegistration({
    registration,
    response: responseWith([
      {
        id: "human-2",
        displayName: "Margaret",
        locationModuleId: "starter-suitport",
      },
    ]),
  });

  expect(readHumansSync()[0]!.locationModuleId).toBe("basic-suitport-1");
});

test("a human assigned to an unknown module aborts the whole registration", async () => {
  const hydrate = hydrateRegistration({
    registration,
    response: responseWith([
      {
        id: "human-1",
        displayName: "Elizabeth",
        locationModuleId: "starter-greenhouse",
      },
    ]),
  });

  expect(hydrate).rejects.toThrow("not one of the starter modules");

  await hydrate.catch(() => {});

  // Nothing was written: no half-registered habitat is left behind.
  expect(await readRegistration()).toBeNull();
  expect(await listHabitatModules()).toHaveLength(0);
  expect(readHumansSync()).toHaveLength(0);
});

// This one fails *inside* the transaction, after the registration row and the
// modules have already been written, so only a real rollback can undo it.
test("humans failing to persist rolls back the registration and modules", async () => {
  const duplicateIds = [
    {
      id: "human-1",
      displayName: "Elizabeth",
      locationModuleId: "starter-command",
    },
    {
      id: "human-1",
      displayName: "Margaret",
      locationModuleId: "starter-suitport",
    },
  ];

  const hydrate = hydrateRegistration({
    registration,
    response: responseWith(duplicateIds),
  });

  expect(hydrate).rejects.toThrow();

  await hydrate.catch(() => {});

  expect(await readRegistration()).toBeNull();
  expect(await listHabitatModules()).toHaveLength(0);
  expect(readHumansSync()).toHaveLength(0);
});
