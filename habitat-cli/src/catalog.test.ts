import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  formatBlueprintDetails,
  formatBlueprintTable,
  formatResourceTable,
  listBlueprints,
  listResources,
  showBlueprint,
} from "./catalog";
import {
  type ProductionBlueprint,
  type ResourceCatalogEntry,
} from "./kepler";

const TEST_BASE_URL = "https://kepler.test";

const blueprints: ProductionBlueprint[] = [
  {
    id: "blueprint-small-solar-array",
    blueprintId: "small-solar-array",
    displayName: "Small Solar Array",
    description: "Generates starter solar power.",
    status: "published",
    output: { powerKw: 12 },
    inputs: { alloy: 4 },
    productionCost: { credits: 100 },
    requiredFacility: {},
    buildTicks: 180,
    prerequisites: [],
    unlocks: ["medium-solar-array"],
    repeatable: true,
    runtimeAttributes: { powerGenerationKw: 12 },
    capabilities: ["solar-generation"],
  },
  {
    id: "blueprint-command-module",
    blueprintId: "command-module",
    displayName: "Command Module",
    description: "Core operations module.",
    status: "draft",
    output: {},
    inputs: {},
    buildTicks: 480,
    prerequisites: ["small-solar-array"],
    unlocks: [],
    repeatable: false,
    runtimeAttributes: {},
    capabilities: ["habitat-command"],
  },
];

const resources: ResourceCatalogEntry[] = [
  {
    id: "resource-water",
    resourceType: "water",
    displayName: "Water",
    kind: "consumable",
    rarity: "common",
    description: "Drinking and coolant water.",
    unit: "liter",
  },
  {
    id: "resource-alloy",
    resourceType: "alloy",
    displayName: "Structural Alloy",
    kind: "material",
    rarity: "uncommon",
    description: "Refined building material.",
    unit: "kg",
  },
];

let restoreFetch: (() => void) | null = null;

function mockKepler(): void {
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (url.endsWith("/catalog/blueprints")) {
        return jsonResponse({ catalogVersion: "kepler-v1", blueprints });
      }

      if (url.endsWith("/catalog/resources")) {
        return jsonResponse({ catalogVersion: "kepler-v1", resources });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    }) as typeof fetch,
  );

  restoreFetch = () => spy.mockRestore();
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockKepler();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

test("listBlueprints returns the catalog blueprints from Kepler", async () => {
  const result = await listBlueprints(TEST_BASE_URL);

  expect(result).toHaveLength(2);
  expect(result.map((blueprint) => blueprint.blueprintId)).toEqual([
    "small-solar-array",
    "command-module",
  ]);
});

test("showBlueprint returns the matching blueprint", async () => {
  const blueprint = await showBlueprint("small-solar-array", TEST_BASE_URL);

  expect(blueprint.displayName).toBe("Small Solar Array");
  expect(blueprint.buildTicks).toBe(180);
});

test("showBlueprint gives a friendly error for a missing blueprint", async () => {
  await expect(showBlueprint("nonexistent", TEST_BASE_URL)).rejects.toThrow(
    "Blueprint 'nonexistent' was not found in the Kepler catalog.",
  );
});

test("listResources returns the resource catalog from Kepler", async () => {
  const result = await listResources(TEST_BASE_URL);

  expect(result).toHaveLength(2);
  expect(result.map((resource) => resource.resourceType)).toEqual([
    "water",
    "alloy",
  ]);
});

test("formatBlueprintTable renders a row per blueprint", () => {
  const table = formatBlueprintTable(blueprints);

  expect(table).toContain("Blueprint");
  expect(table).toContain("small-solar-array");
  expect(table).toContain("Small Solar Array");
  expect(table).toContain("command-module");
});

test("formatBlueprintTable handles the empty case", () => {
  expect(formatBlueprintTable([])).toBe("No blueprints available.");
});

test("formatBlueprintDetails frames inputs as build requirements", () => {
  const details = formatBlueprintDetails(blueprints[0]!);

  expect(details).toContain("small-solar-array");
  expect(details).toContain("Inputs (needed to build)");
  expect(details).toContain("Capabilities: solar-generation");
});

test("formatResourceTable clarifies these are types, not owned inventory", () => {
  const table = formatResourceTable(resources);

  expect(table).toContain("not resources your habitat owns");
  expect(table).toContain("water");
  expect(table).toContain("Structural Alloy");
  // It must not imply the habitat holds any of these resources.
  expect(table.toLowerCase()).not.toContain("inventory");
  expect(table.toLowerCase()).not.toContain("owned");
});

test("formatResourceTable handles the empty case without inventory claims", () => {
  const table = formatResourceTable([]);

  expect(table).toContain("not resources your habitat owns");
  expect(table).toContain("No resource types available.");
});
