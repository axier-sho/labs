import { getDb } from "./db";

// Local material inventory for the Habitat CLI. This is deliberately separate
// from the read-only Kepler resource catalog: the catalog describes what a
// resource *is*, while this table tracks how much of each resource the local
// habitat actually holds and can spend on construction.
//
// One row per material in the `inventory` table (see src/db.ts); a stack that
// reaches zero is deleted rather than stored as 0.

export type InventoryEntry = {
  resource: string;
  quantity: number;
};

type InventoryState = {
  resources: Record<string, number>;
};

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
  return { resources: readInventorySync() };
}

function readInventorySync(): Record<string, number> {
  const rows = getDb()
    .query("SELECT resource, quantity FROM inventory ORDER BY resource")
    .all() as Array<{ resource: string; quantity: number }>;

  const resources: Record<string, number> = {};

  for (const row of rows) {
    resources[row.resource] = row.quantity;
  }

  return resources;
}

async function writeInventoryState(state: InventoryState): Promise<void> {
  getDb().transaction(() => writeInventorySync(state.resources))();
}

// Replace the whole inventory table. Like writeModulesSync, this carries no
// transaction of its own so docking can commit the unload alongside the human
// and explorer changes in one go.
export function writeInventorySync(resources: Record<string, number>): void {
  const database = getDb();
  database.run("DELETE FROM inventory");

  const insert = database.query(
    "INSERT INTO inventory (resource, quantity) VALUES (?, ?)",
  );

  for (const [resource, quantity] of Object.entries(resources)) {
    if (Number.isFinite(quantity) && quantity > 0) {
      insert.run(resource, quantity);
    }
  }
}

export function clearInventorySync(): void {
  getDb().run("DELETE FROM inventory");
}

// Fold `additions` (resource -> kg) into the inventory. Used by docking, which
// already holds a transaction, so this must stay synchronous and unwrapped.
export function addInventorySync(additions: Record<string, number>): void {
  const insert = getDb().query(
    "INSERT INTO inventory (resource, quantity) VALUES (?, ?) " +
      "ON CONFLICT(resource) DO UPDATE SET quantity = quantity + excluded.quantity",
  );

  for (const [resource, quantity] of Object.entries(additions)) {
    if (Number.isFinite(quantity) && quantity > 0) {
      insert.run(resource, quantity);
    }
  }
}

function normalizeResource(resource: string): string {
  const trimmed = resource.trim();

  if (trimmed === "") {
    throw new Error("Resource name must be a non-empty string.");
  }

  return trimmed;
}
