import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateModulesFromRegistration, listHabitatModules } from "./modules";
import { runPowerTicks, totalDrawKw } from "./tick";
import { CONSTRUCTION_JOB_KEY } from "./construction";
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

// A solar array (12 kW rated) plus a battery, each with a settable status so a
// test can take the panel or battery offline. The battery draws nothing, so any
// change in its charge over a run is purely solar generation.
function seedSolarAndBattery(input: {
  currentEnergyKwh: number;
  solarStatus?: string;
  batteryStatus?: string;
}): StarterModuleInstance[] {
  return [
    {
      id: "starter-solar",
      blueprintId: "small-solar-array",
      displayName: "Small Solar Array",
      connectedTo: [],
      runtimeAttributes: {
        status: input.solarStatus ?? "online",
        powerGenerationKw: 12,
        powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      },
      capabilities: ["solar-generation"],
    },
    {
      id: "starter-battery",
      blueprintId: "basic-battery",
      displayName: "Basic Battery",
      connectedTo: [],
      runtimeAttributes: {
        status: input.batteryStatus ?? "online",
        currentEnergyKwh: input.currentEnergyKwh,
        energyStorageKwh: 500,
        powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      },
      capabilities: ["power-storage"],
    },
  ];
}

// Records whether the injected irradiance fetcher was called, so tests can prove
// the CLI does not query Kepler when charging is impossible anyway.
function stubIrradiance(irradiance: { wPerM2: number; condition: string } | null) {
  const state = { calls: 0 };

  return {
    state,
    fetchIrradiance: async () => {
      state.calls += 1;
      return irradiance;
    },
  };
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

test("charges an online battery by 6 kWh over a clear simulated hour", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({ currentEnergyKwh: 100 }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 900, condition: "clear" });

  // 12 kW * 1.0 sunlight * 0.5 efficiency = 6 kW effective -> 6 kWh over 3600 ticks.
  const summary = await runPowerTicks(3600, solar);

  expect(solar.state.calls).toBe(1);
  expect(summary.solarGeneratedKwh).toBeCloseTo(6, 6);
  expect(summary.batteryEnergyKwh).toBeCloseTo(106, 6);
  expect(summary.solarSkipReason).toBeNull();
  expect(await batteryEnergy()).toBeCloseTo(106, 6);
});

test("scales generation down with lower irradiance", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({ currentEnergyKwh: 100 }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 450, condition: "dust" });

  // Half the clear-day irradiance yields half the charge: 3 kWh over one hour.
  const summary = await runPowerTicks(3600, solar);

  expect(summary.solarGeneratedKwh).toBeCloseTo(3, 6);
  expect(summary.batteryEnergyKwh).toBeCloseTo(103, 6);
});

test("never charges a battery beyond its capacity", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({ currentEnergyKwh: 498 }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 900, condition: "clear" });

  // Only 2 kWh of headroom remains, so 4 of the 6 generated kWh are discarded.
  const summary = await runPowerTicks(3600, solar);

  expect(summary.solarGeneratedKwh).toBeCloseTo(2, 6);
  expect(summary.batteryEnergyKwh).toBe(500);
  expect(summary.solarSkipReason).toBeNull();
});

test("does not query Kepler when the solar panel is offline", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({
      currentEnergyKwh: 100,
      solarStatus: "offline",
    }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 900, condition: "clear" });

  const summary = await runPowerTicks(3600, solar);

  expect(solar.state.calls).toBe(0);
  expect(summary.solarGeneratedKwh).toBe(0);
  expect(summary.solarSkipReason).toBe("solar panel is offline");
  expect(await batteryEnergy()).toBe(100);
});

test("does not query Kepler when the battery is offline", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({
      currentEnergyKwh: 100,
      batteryStatus: "offline",
    }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 900, condition: "clear" });

  const summary = await runPowerTicks(3600, solar);

  expect(solar.state.calls).toBe(0);
  expect(summary.solarGeneratedKwh).toBe(0);
  expect(summary.solarSkipReason).toBe("no online battery to receive charge");
});

test("skips charging when Kepler has no usable reading", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({ currentEnergyKwh: 100 }),
    blueprints: [],
  });
  const solar = stubIrradiance(null);

  const summary = await runPowerTicks(3600, solar);

  expect(solar.state.calls).toBe(1);
  expect(summary.solarGeneratedKwh).toBe(0);
  expect(summary.solarSkipReason).toBe(
    "Kepler solar irradiance was unavailable",
  );
  expect(await batteryEnergy()).toBe(100);
});

test("generates no charge when sunlight is zero", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedSolarAndBattery({ currentEnergyKwh: 100 }),
    blueprints: [],
  });
  const solar = stubIrradiance({ wPerM2: 0, condition: "night" });

  const summary = await runPowerTicks(3600, solar);

  expect(summary.solarGeneratedKwh).toBe(0);
  expect(summary.solarSkipReason).toBe("no usable sunlight (0 W/m^2, night)");
  expect(await batteryEnergy()).toBe(100);
});

test("reports no solar panel when the habitat has none", async () => {
  await hydrateModulesFromRegistration({
    starterModules: seedModules(100),
    blueprints: [],
  });

  const summary = await runPowerTicks(1);

  expect(summary.solarGeneratedKwh).toBe(0);
  expect(summary.solarSkipReason).toBe("no solar panel in the habitat");
});

test("a solar array finished by construction becomes usable for charging", async () => {
  // A workshop-fabricator one tick away from finishing a small-solar-array. The
  // job carries exactly the runtime attributes a real blueprint provides, so
  // completion mirrors the production path.
  const fabricator: StarterModuleInstance = {
    id: "starter-fabricator",
    blueprintId: "workshop-fabricator",
    displayName: "Workshop Fabricator",
    connectedTo: [],
    runtimeAttributes: {
      status: "active",
      powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      [CONSTRUCTION_JOB_KEY]: {
        blueprintId: "small-solar-array",
        outputModuleId: "small-solar-array-1",
        outputModuleType: "small-solar-array",
        buildTicks: 1,
        remainingTicks: 1,
        productionPowerCostKw: 0,
        runtimeAttributes: {
          status: "online",
          powerGenerationKw: 12,
          powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
        },
        capabilities: ["solar-generation"],
        spent: {},
      },
    },
    capabilities: ["fabrication"],
  };
  const battery: StarterModuleInstance = {
    id: "starter-battery",
    blueprintId: "basic-battery",
    displayName: "Basic Battery",
    connectedTo: [],
    runtimeAttributes: {
      status: "online",
      currentEnergyKwh: 100,
      energyStorageKwh: 500,
      reserveKwh: 60,
      powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
    },
    capabilities: ["power-storage"],
  };

  await hydrateModulesFromRegistration({
    starterModules: [fabricator, battery],
    blueprints: [],
  });

  // Run 1 finishes the build. The panel did not exist when the run started, so
  // no sunlight is queried and nothing charges yet.
  const build = stubIrradiance({ wPerM2: 900, condition: "clear" });
  const buildSummary = await runPowerTicks(1, build);

  expect(build.state.calls).toBe(0);
  expect(buildSummary.completions.map((c) => c.moduleId)).toContain(
    "small-solar-array-1",
  );
  expect(buildSummary.solarSkipReason).toBe("solar panel is offline");

  const afterBuild = await listHabitatModules();
  const panel = afterBuild.find((m) => m.id === "small-solar-array-1");
  expect(panel?.runtimeAttributes.status).toBe("online");
  expect(panel?.runtimeAttributes.powerGenerationKw).toBe(12);

  // Run 2 sees the now-online panel and charges the battery for real.
  const charge = stubIrradiance({ wPerM2: 900, condition: "clear" });
  const chargeSummary = await runPowerTicks(3600, charge);

  expect(charge.state.calls).toBe(1);
  expect(chargeSummary.solarGeneratedKwh).toBeCloseTo(6, 6);
  expect(chargeSummary.batteryEnergyKwh).toBeCloseTo(106, 6);
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
