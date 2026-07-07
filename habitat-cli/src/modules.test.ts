import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHabitatModule,
  deleteHabitatModule,
  getBlueprintById,
  getHabitatModule,
  hydrateModulesFromRegistration,
  listHabitatModules,
  replaceBlueprintCatalog,
  updateHabitatModule,
} from "./modules";
import {
  type ProductionBlueprint,
  type StarterModuleInstance,
} from "./kepler";

type StarterModuleFixture = {
  id: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

const starterModules: StarterModuleInstance[] = [
  {
    id: "starter-command",
    blueprintId: "command-module",
    displayName: "Command Module",
    connectedTo: [],
    runtimeAttributes: { health: 100, status: "active" },
    capabilities: ["habitat-command"],
  },
  {
    id: "starter-life-support",
    blueprintId: "life-support",
    displayName: "Life Support",
    connectedTo: ["starter-command"],
    runtimeAttributes: { health: 100, status: "active" },
    capabilities: ["atmosphere-control"],
  },
  {
    id: "starter-battery",
    blueprintId: "basic-battery",
    displayName: "Basic Battery",
    connectedTo: ["starter-command"],
    runtimeAttributes: { health: 100, status: "offline" },
    capabilities: ["power-storage"],
  },
  {
    id: "starter-supply-cache",
    blueprintId: "supply-cache",
    displayName: "Supply Cache",
    connectedTo: ["starter-command"],
    runtimeAttributes: { health: 100, status: "active" },
    capabilities: ["storage"],
  },
  {
    id: "starter-workshop",
    blueprintId: "workshop-fabricator",
    displayName: "Workshop Fabricator",
    connectedTo: ["starter-command"],
    runtimeAttributes: { health: 100, status: "idle" },
    capabilities: ["basic-fabrication"],
  },
  {
    id: "starter-suitport",
    blueprintId: "basic-suitport",
    displayName: "Basic Suitport",
    connectedTo: ["starter-command"],
    runtimeAttributes: { health: 100, status: "idle" },
    capabilities: ["limited-eva"],
  },
];

const starterBlueprints: ProductionBlueprint[] = [
  {
    id: "blueprint-command-module",
    blueprintId: "command-module",
    displayName: "Command Module Blueprint",
    description: "Core operations module.",
    status: "published",
    cost: {},
    buildTicks: 480,
    requires: [],
    provides: {},
    consumes: {},
    unlocks: [],
    output: {},
    inputs: {},
    productionCost: {},
    requiredFacility: {},
    prerequisites: [],
    repeatable: false,
    runtimeAttributes: { crewCapacity: 2 },
    capabilities: ["habitat-command"],
  },
];

const buildableBlueprint: ProductionBlueprint = {
  id: "blueprint-small-solar-array",
  blueprintId: "small-solar-array",
  displayName: "Small Solar Array Blueprint",
  description: "Generates starter solar power.",
  status: "published",
  cost: {},
  buildTicks: 180,
  requires: [],
  provides: {},
  consumes: {},
  unlocks: [],
  output: {},
  inputs: {},
  productionCost: {},
  requiredFacility: {},
  prerequisites: [],
  repeatable: true,
  runtimeAttributes: { powerGenerationKw: 12 },
  capabilities: ["solar-generation"],
};

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "habitat-modules-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir("/Users/sho/Desktop/labs/habitat-cli");
  await rm(tempDir, { recursive: true, force: true });
});

test("hydrates starter modules from the registration response", async () => {
  await hydrateModulesFromRegistration({
    starterModules,
    blueprints: starterBlueprints,
  });

  const modules = await listHabitatModules();
  expect(modules).toHaveLength(6);
  expect(modules[0]?.id).toBe("command-module-1");
  expect(modules[1]?.id).toBe("life-support-1");
  expect(modules[0]?.blueprintId).toBe("command-module");
  expect(modules[1]?.connectedTo).toEqual(["command-module-1"]);

  const blueprint = await getBlueprintById("command-module");
  expect(blueprint?.displayName).toBe("Command Module Blueprint");
});

test("creates, updates, and deletes a module from cached blueprint data", async () => {
  await replaceBlueprintCatalog({
    catalogVersion: "kepler-442b-v1",
    blueprints: [buildableBlueprint],
  });

  const created = await createHabitatModule({
    blueprintId: "small-solar-array",
    displayName: "Roof Solar",
  });

  expect(created.blueprintId).toBe("small-solar-array");
  expect(created.id).toBe("small-solar-array-1");
  expect(await listHabitatModules()).toHaveLength(1);

  const updated = await updateHabitatModule(created.id, {
    displayName: "Roof Solar Prime",
  });

  expect(updated.displayName).toBe("Roof Solar Prime");
  expect((await getHabitatModule(created.id))?.displayName).toBe(
    "Roof Solar Prime",
  );

  await deleteHabitatModule(created.id);
  expect(await getHabitatModule(created.id)).toBeNull();
  expect(await listHabitatModules()).toHaveLength(0);
});

test("creates module ids from a slug and sequence number", async () => {
  await replaceBlueprintCatalog({
    catalogVersion: "kepler-442b-v1",
    blueprints: [buildableBlueprint],
  });

  const first = await createHabitatModule({
    blueprintId: "small-solar-array",
    displayName: "Roof Solar",
  });
  const second = await createHabitatModule({
    blueprintId: "small-solar-array",
    displayName: "Roof Solar",
  });

  expect(first.id).toBe("small-solar-array-1");
  expect(second.id).toBe("small-solar-array-2");
  expect((await listHabitatModules()).map((module) => module.id)).toEqual([
    "small-solar-array-1",
    "small-solar-array-2",
  ]);
});

test("updates runtime attributes from status and condition flags", async () => {
  await replaceBlueprintCatalog({
    catalogVersion: "kepler-442b-v1",
    blueprints: [buildableBlueprint],
  });

  const created = await createHabitatModule({
    blueprintId: "small-solar-array",
    displayName: "Roof Solar",
  });

  const updated = await updateHabitatModule(created.id, {
    status: "maintenance",
    condition: 87,
  });

  expect(updated.runtimeAttributes.status).toBe("maintenance");
  expect(updated.runtimeAttributes.condition).toBe(87);
});
