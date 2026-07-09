import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getHabitatModule,
  hydrateModulesFromRegistration,
  listHabitatModules,
  writeHabitatModules,
} from "./modules";
import { addInventory, getInventoryQuantity } from "./inventory";
import {
  cancelConstruction,
  evaluateConstruction,
  listActiveConstructions,
  readConstructionJob,
  startConstruction,
} from "./construction";
import { runPowerTicks } from "./tick";
import type { ProductionBlueprint, StarterModuleInstance } from "./kepler";

const SOLAR_BLUEPRINT: ProductionBlueprint = {
  id: "blueprint_test_small-solar-array",
  blueprintId: "small-solar-array",
  displayName: "Small Solar Array Blueprint",
  description: "",
  status: "published",
  output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
  inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
  productionCost: { power: 3 },
  requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
  buildTicks: 3,
  prerequisites: [],
  unlocks: [],
  repeatable: true,
  runtimeAttributes: {
    status: "online",
    powerGenerationKw: 12,
    powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
  },
  capabilities: ["solar-generation"],
};

function starterModules(options: {
  supplyCacheStatus?: string;
  batteryEnergyKwh?: number;
}): StarterModuleInstance[] {
  return [
    {
      id: "starter-fabricator",
      blueprintId: "workshop-fabricator",
      displayName: "Workshop Fabricator",
      connectedTo: [],
      runtimeAttributes: {
        status: "online",
        powerDrawKw: { offline: 0, online: 1, active: 8, damaged: 1 },
      },
      capabilities: ["basic-fabrication"],
    },
    {
      id: "starter-supply-cache",
      blueprintId: "supply-cache",
      displayName: "Supply Cache",
      connectedTo: [],
      runtimeAttributes: {
        status: options.supplyCacheStatus ?? "online",
        powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      },
      capabilities: ["storage"],
    },
    {
      id: "starter-battery",
      blueprintId: "basic-battery",
      displayName: "Basic Battery",
      connectedTo: [],
      runtimeAttributes: {
        status: "online",
        currentEnergyKwh: options.batteryEnergyKwh ?? 500,
        energyStorageKwh: 500,
        reserveKwh: 60,
        powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
      },
      capabilities: ["power-storage"],
    },
  ];
}

async function seed(options: {
  supplyCacheStatus?: string;
  batteryEnergyKwh?: number;
  withMaterials?: boolean;
}): Promise<void> {
  await hydrateModulesFromRegistration({
    starterModules: starterModules(options),
    blueprints: [SOLAR_BLUEPRINT],
  });

  if (options.withMaterials ?? true) {
    await addInventory("ferrite", 90);
    await addInventory("silicate-glass", 45);
    await addInventory("conductive-ore", 18);
  }
}

async function depleteBattery(): Promise<void> {
  const modules = await listHabitatModules();
  const battery = modules.find((m) => m.blueprintId === "basic-battery");

  if (battery !== undefined) {
    battery.runtimeAttributes.currentEnergyKwh = 10;
  }

  await writeHabitatModules(modules);
}

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "habitat-construction-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir("/Users/sho/Desktop/labs/habitat-cli");
  await rm(tempDir, { recursive: true, force: true });
});

test("dry-run passes when the habitat is ready", async () => {
  await seed({});

  const evaluation = await evaluateConstruction("small-solar-array");

  expect(evaluation.canStart).toBe(true);
  expect(evaluation.requiredResources).toEqual({
    ferrite: 90,
    "silicate-glass": 45,
    "conductive-ore": 18,
  });
});

test("dry-run fails and changes nothing when the supply cache is offline", async () => {
  await seed({ supplyCacheStatus: "offline" });

  const evaluation = await evaluateConstruction("small-solar-array");

  expect(evaluation.canStart).toBe(false);
  const cacheCheck = evaluation.checks.find((c) =>
    c.label.includes("Supply cache"),
  );
  expect(cacheCheck?.ok).toBe(false);
  // Inventory untouched by a dry run.
  expect(await getInventoryQuantity("ferrite")).toBe(90);
});

test("start spends materials and attaches a job to the facility", async () => {
  await seed({});

  const { facilityId, job } = await startConstruction("small-solar-array");

  expect(facilityId).toBe("workshop-fabricator-1");
  expect(job.remainingTicks).toBe(3);
  expect(await getInventoryQuantity("ferrite")).toBe(0);

  const fabricator = await getHabitatModule("workshop-fabricator-1");
  expect(fabricator?.runtimeAttributes.status).toBe("active");
  expect(readConstructionJob(fabricator!)).not.toBeNull();

  // Output module does not exist yet.
  expect(await getHabitatModule("small-solar-array-1")).toBeNull();
});

test("refuses to start when materials are missing and does not spend", async () => {
  await seed({ withMaterials: false });
  await addInventory("ferrite", 10);

  await expect(startConstruction("small-solar-array")).rejects.toThrow(
    "Construction cannot start",
  );

  expect(await getInventoryQuantity("ferrite")).toBe(10);
  const fabricator = await getHabitatModule("workshop-fabricator-1");
  expect(fabricator?.runtimeAttributes.status).toBe("online");
});

test("ticks complete the build, create the module, and free the facility", async () => {
  await seed({});
  await startConstruction("small-solar-array");

  const summary = await runPowerTicks(3);

  expect(summary.completions).toHaveLength(1);
  expect(await listActiveConstructions()).toHaveLength(0);

  const built = await getHabitatModule("small-solar-array-1");
  expect(built?.runtimeAttributes.status).toBe("online");
  expect(built?.capabilities).toEqual(["solar-generation"]);
  expect(built?.runtimeAttributes.powerGenerationKw).toBe(12);

  const fabricator = await getHabitatModule("workshop-fabricator-1");
  expect(fabricator?.runtimeAttributes.status).toBe("online");
  expect(readConstructionJob(fabricator!)).toBeNull();
});

test("an unpowered tick does not advance construction", async () => {
  // Start while powered, then drain the battery below its reserve so the build
  // is left stranded without usable power.
  await seed({});
  await startConstruction("small-solar-array");
  await depleteBattery();

  const summary = await runPowerTicks(3);

  expect(summary.constructionStalled).toBe(true);
  const active = await listActiveConstructions();
  expect(active).toHaveLength(1);
  expect(active[0]?.job.remainingTicks).toBe(3);
  expect(await getHabitatModule("small-solar-array-1")).toBeNull();
});

test("cancel clears the job, frees the facility, and does not refund", async () => {
  await seed({});
  await startConstruction("small-solar-array");

  const { job } = await cancelConstruction("workshop-fabricator-1");

  expect(job.outputModuleId).toBe("small-solar-array-1");
  expect(await listActiveConstructions()).toHaveLength(0);

  const fabricator = await getHabitatModule("workshop-fabricator-1");
  expect(fabricator?.runtimeAttributes.status).toBe("online");

  // Materials stay spent and no module was created.
  expect(await getInventoryQuantity("ferrite")).toBe(0);
  expect(await getHabitatModule("small-solar-array-1")).toBeNull();
  expect(
    (await listHabitatModules()).some(
      (m) => m.blueprintId === "small-solar-array",
    ),
  ).toBe(false);
});
