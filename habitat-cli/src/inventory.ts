import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

// Local material inventory for the Habitat CLI. This is deliberately separate
// from the read-only Kepler resource catalog: the catalog describes what a
// resource *is*, while this file tracks how much of each resource the local
// habitat actually holds and can spend on construction.
//
// State shape on disk (.habitat/inventory.json):
//   { "resources": { "ferrite": 90, "silicate-glass": 45 } }

export type InventoryEntry = {
  resource: string;
  quantity: number;
};

type InventoryState = {
  resources: Record<string, number>;
};

const INVENTORY_STATE_FILE = "inventory.json";

function inventoryStatePath(): string {
  return join(process.cwd(), ".habitat", INVENTORY_STATE_FILE);
}

export async function listInventory(): Promise<InventoryEntry[]> {
  const state = await readInventoryState();

  return Object.entries(state.resources)
    .map(([resource, quantity]) => ({ resource, quantity }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

export async function getInventoryQuantity(resource: string): Promise<number> {
  const state = await readInventoryState();

  return state.resources[resource] ?? 0;
}

export async function addInventory(
  resource: string,
  quantity: number,
): Promise<InventoryEntry> {
  const normalized = normalizeResource(resource);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity to add must be a positive integer.");
  }

  const state = await readInventoryState();
  const next = (state.resources[normalized] ?? 0) + quantity;
  state.resources[normalized] = next;

  await writeInventoryState(state);

  return { resource: normalized, quantity: next };
}

// Spend a set of required resources atomically. Throws if any required amount
// is missing so callers can check-then-spend without leaving a partial deduct.
export async function spendInventory(
  requirements: Record<string, number>,
): Promise<void> {
  const state = await readInventoryState();

  const shortfalls = findShortfalls(state.resources, requirements);

  if (shortfalls.length > 0) {
    throw new Error(
      `Not enough materials to spend: ${shortfalls
        .map((s) => `${s.resource} (need ${s.required}, have ${s.available})`)
        .join(", ")}`,
    );
  }

  for (const [resource, amount] of Object.entries(requirements)) {
    state.resources[resource] = (state.resources[resource] ?? 0) - amount;

    if (state.resources[resource] === 0) {
      delete state.resources[resource];
    }
  }

  await writeInventoryState(state);
}

export type Shortfall = {
  resource: string;
  required: number;
  available: number;
};

// Report which requirements the current inventory cannot cover. Used by the
// construction dry run and the real construct command before spending.
export async function findInventoryShortfalls(
  requirements: Record<string, number>,
): Promise<Shortfall[]> {
  const state = await readInventoryState();

  return findShortfalls(state.resources, requirements);
}

function findShortfalls(
  resources: Record<string, number>,
  requirements: Record<string, number>,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];

  for (const [resource, required] of Object.entries(requirements)) {
    const available = resources[resource] ?? 0;

    if (available < required) {
      shortfalls.push({ resource, required, available });
    }
  }

  return shortfalls;
}

async function readInventoryState(): Promise<InventoryState> {
  const file = Bun.file(inventoryStatePath());

  if (!(await file.exists())) {
    return { resources: {} };
  }

  const contents = await file.text();

  if (contents.trim() === "") {
    return { resources: {} };
  }

  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const rawResources =
    typeof parsed.resources === "object" &&
    parsed.resources !== null &&
    !Array.isArray(parsed.resources)
      ? (parsed.resources as Record<string, unknown>)
      : {};

  const resources: Record<string, number> = {};

  for (const [resource, value] of Object.entries(rawResources)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      resources[resource] = value;
    }
  }

  return { resources };
}

async function writeInventoryState(state: InventoryState): Promise<void> {
  await mkdir(dirname(inventoryStatePath()), { recursive: true });
  await Bun.write(
    inventoryStatePath(),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

function normalizeResource(resource: string): string {
  const trimmed = resource.trim();

  if (trimmed === "") {
    throw new Error("Resource name must be a non-empty string.");
  }

  return trimmed;
}
