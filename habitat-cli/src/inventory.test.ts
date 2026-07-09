import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addInventory,
  findInventoryShortfalls,
  getInventoryQuantity,
  listInventory,
  spendInventory,
} from "./inventory";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "habitat-inventory-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir("/Users/sho/Desktop/labs/habitat-cli");
  await rm(tempDir, { recursive: true, force: true });
});

test("adds quantities and accumulates repeated resources", async () => {
  await addInventory("ferrite", 90);
  await addInventory("ferrite", 10);

  expect(await getInventoryQuantity("ferrite")).toBe(100);
  expect(await listInventory()).toEqual([{ resource: "ferrite", quantity: 100 }]);
});

test("rejects non-positive additions", async () => {
  await expect(addInventory("ferrite", 0)).rejects.toThrow(
    "positive integer",
  );
});

test("reports shortfalls without spending", async () => {
  await addInventory("ferrite", 50);

  const shortfalls = await findInventoryShortfalls({ ferrite: 90 });

  expect(shortfalls).toEqual([
    { resource: "ferrite", required: 90, available: 50 },
  ]);
  // findInventoryShortfalls must not mutate state.
  expect(await getInventoryQuantity("ferrite")).toBe(50);
});

test("spends required materials atomically and refuses partial spends", async () => {
  await addInventory("ferrite", 90);
  await addInventory("silicate-glass", 45);

  await expect(
    spendInventory({ ferrite: 90, "conductive-ore": 18 }),
  ).rejects.toThrow("Not enough materials");

  // Nothing was deducted because the spend failed as a whole.
  expect(await getInventoryQuantity("ferrite")).toBe(90);

  await spendInventory({ ferrite: 90, "silicate-glass": 45 });

  expect(await listInventory()).toEqual([]);
});
