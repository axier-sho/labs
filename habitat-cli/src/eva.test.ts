import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carryCapacityOf, findSuitport, EvaValidationError } from "./eva";
import {
  addCarriedSync,
  carriedTotalKg,
  clearCarriedSync,
  readCarriedSync,
  readEvaSync,
  writeEvaSync,
} from "./eva-state";
import type { HabitatModule } from "./modules";

// These cover the EVA rules that do not need Kepler: capacity derivation,
// suitport lookup, and the shape of the persisted exploration state. The
// movement and collection rules that call the planet server are exercised
// end-to-end through the CLI instead.

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "habitat-eva-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

function moduleWith(
  overrides: Partial<HabitatModule> & { id: string },
): HabitatModule {
  return {
    blueprintId: "basic-suitport",
    displayName: "Basic Suitport",
    connectedTo: [],
    runtimeAttributes: {},
    capabilities: [],
    ...overrides,
  };
}

test("finds the suitport by capability, not by blueprint id", () => {
  const modules = [
    moduleWith({ id: "command-module-1", capabilities: ["habitat-command"] }),
    moduleWith({ id: "fancy-airlock-1", capabilities: ["suitport-access"] }),
  ];

  expect(findSuitport(modules).id).toBe("fancy-airlock-1");
});

test("refuses to find a suitport when no module offers the capability", () => {
  const modules = [
    moduleWith({ id: "command-module-1", capabilities: ["habitat-command"] }),
  ];

  expect(() => findSuitport(modules)).toThrow(EvaValidationError);
});

test("derives carrying capacity from the suitport's cargo transfer rating", () => {
  const suitport = moduleWith({
    id: "basic-suitport-1",
    runtimeAttributes: { cargoTransferRating: "poor" },
  });

  expect(carryCapacityOf(suitport)).toBe(10);
});

test("prefers an explicit kilogram capacity over the rating", () => {
  const suitport = moduleWith({
    id: "basic-suitport-1",
    runtimeAttributes: { cargoTransferRating: "poor", cargoCapacityKg: 42 },
  });

  expect(carryCapacityOf(suitport)).toBe(42);
});

test("falls back to the most conservative capacity for an unknown rating", () => {
  const suitport = moduleWith({
    id: "basic-suitport-1",
    runtimeAttributes: { cargoTransferRating: "spectacular" },
  });

  expect(carryCapacityOf(suitport)).toBe(10);
});

test("no exploration row means nobody is outside", () => {
  expect(readEvaSync()).toBeNull();
});

test("carried resources accumulate per material and total across them", () => {
  writeEvaSync({
    deployedHumanId: "human-1",
    suitportModuleId: "basic-suitport-1",
    x: 0,
    y: 0,
    maxCarryKg: 10,
    deployedAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  });

  addCarriedSync("ferrite", 3);
  addCarriedSync("ferrite", 2);
  addCarriedSync("ice-regolith", 1);

  expect(readCarriedSync()).toEqual([
    { resource: "ferrite", quantityKg: 5 },
    { resource: "ice-regolith", quantityKg: 1 },
  ]);
  expect(carriedTotalKg(readCarriedSync())).toBe(6);

  clearCarriedSync();
  expect(readCarriedSync()).toEqual([]);
});
