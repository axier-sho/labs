import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateModulesFromRegistration, listHabitatModules } from "./modules";
import { runPowerTicks, totalDrawKw } from "./tick";
import { type StarterModuleInstance } from "./kepler";

// A consumer drawing 5 kW while active plus a battery holding 500 kWh; total
// habitat demand is 5 kW because the battery itself draws nothing.
function seedModules(
  currentEnergyKwh: number,
): StarterModuleInstance[] {
  return [
    {
      id: "starter-life-support",
      blueprintId: "life-support",
      displayName: "Life Support",
      connectedTo: [],
      runtimeAttributes: {
        status: "active",
        powerDrawKw: { offline: 0, online: 5, active: 5, damaged: 5 },
      },
      capabilities: ["atmosphere-control"],
    },
    {
      id: "starter-battery",
      blueprintId: "basic-battery",
      displayName: "Basic Battery",
      connectedTo: [],
      runtimeAttributes: {
        status: "online",
        currentEnergyKwh,
        energyStorageKwh: 500,
        powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      },
      capabilities: ["power-storage"],
    },
  ];
}

async function batteryEnergy(): Promise<number> {
  const modules = await listHabitatModules();
  const battery = modules.find(
    (module) => module.blueprintId === "basic-battery",
  );

  return battery?.runtimeAttributes.currentEnergyKwh as number;
}

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "habitat-tick-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir("/Users/sho/Desktop/labs/habitat-cli");
  await rm(tempDir, { recursive: true, force: true });
});

test("drains the battery by the total draw over one simulated hour", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedModules(500),
    blueprints: [],
  });

  const summary = await runPowerTicks(3600);

  expect(summary.powerDrawKw).toBe(5);
  expect(summary.energyConsumedKwh).toBeCloseTo(5, 6);
  expect(summary.batteryEnergyKwh).toBeCloseTo(495, 6);
  expect(await batteryEnergy()).toBeCloseTo(495, 6);
});

test("defaults a single tick to draw / 3600 kWh", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedModules(500),
    blueprints: [],
  });

  const summary = await runPowerTicks(1);

  expect(summary.energyConsumedKwh).toBeCloseTo(5 / 3600, 9);
  expect(summary.batteryEnergyKwh).toBeCloseTo(500 - 5 / 3600, 9);
});

test("clamps the battery at zero and never over-consumes", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedModules(1),
    blueprints: [],
  });

  // 1 kWh of energy at 5 kW drains in 720 ticks; running more must not go negative.
  const summary = await runPowerTicks(3600);

  expect(summary.batteryEnergyKwh).toBe(0);
  expect(summary.energyConsumedKwh).toBeCloseTo(1, 6);
  expect(await batteryEnergy()).toBe(0);
});

test("a status with no powerDrawKw entry draws zero", async () => {
  const modules: StarterModuleInstance[] = [
    {
      id: "starter-command",
      blueprintId: "command-module",
      displayName: "Command Module",
      connectedTo: [],
      runtimeAttributes: {
        status: "maintenance",
        powerDrawKw: { offline: 0, online: 2, active: 2, damaged: 2 },
      },
      capabilities: ["habitat-command"],
    },
  ];

  await hydrateModulesFromRegistration({ starterModules: modules, blueprints: [] });

  expect(totalDrawKw(await listHabitatModules())).toBe(0);
});

test("rejects a non-positive tick count", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedModules(500),
    blueprints: [],
  });

  await expect(runPowerTicks(0)).rejects.toThrow(
    "Tick count must be a positive integer.",
  );
});
