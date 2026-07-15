import { getDb } from "./db";

// Raw persistence for the exploration state, and nothing else. This module is
// deliberately ignorant of humans, modules and Kepler: keeping the table
// accessors separate from the EVA rules is what lets src/humans.ts ask "is this
// human outside?" without importing src/eva.ts, which imports src/humans.ts.
//
// Every function here is synchronous and unwrapped so that deploying and
// docking can commit across several tables in one transaction.

export type EvaRecord = {
  deployedHumanId: string;
  suitportModuleId: string;
  x: number;
  y: number;
  maxCarryKg: number;
  deployedAt: string;
  updatedAt: string;
};

export type CarriedResource = {
  resource: string;
  quantityKg: number;
};

// Null means nobody is outside. There is no "deployed: false" row.
export function readEvaSync(): EvaRecord | null {
  const row = getDb()
    .query(
      "SELECT deployedHumanId, suitportModuleId, x, y, maxCarryKg, deployedAt, " +
        "updatedAt FROM eva WHERE id = 1",
    )
    .get() as EvaRecord | null;

  return row ?? null;
}

export function writeEvaSync(record: EvaRecord): void {
  getDb().run(
    "INSERT INTO eva " +
      "(id, deployedHumanId, suitportModuleId, x, y, maxCarryKg, deployedAt, updatedAt) " +
      "VALUES (1, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "deployedHumanId = excluded.deployedHumanId, " +
      "suitportModuleId = excluded.suitportModuleId, " +
      "x = excluded.x, y = excluded.y, " +
      "maxCarryKg = excluded.maxCarryKg, " +
      "deployedAt = excluded.deployedAt, " +
      "updatedAt = excluded.updatedAt",
    [
      record.deployedHumanId,
      record.suitportModuleId,
      record.x,
      record.y,
      record.maxCarryKg,
      record.deployedAt,
      record.updatedAt,
    ],
  );
}

export function setEvaPositionSync(x: number, y: number, at: string): void {
  getDb().run("UPDATE eva SET x = ?, y = ?, updatedAt = ? WHERE id = 1", [
    x,
    y,
    at,
  ]);
}

export function clearEvaSync(): void {
  getDb().run("DELETE FROM eva WHERE id = 1");
}

export function readCarriedSync(): CarriedResource[] {
  return getDb()
    .query(
      "SELECT resource, quantityKg FROM eva_carried ORDER BY resource",
    )
    .all() as CarriedResource[];
}

export function addCarriedSync(resource: string, quantityKg: number): void {
  getDb().run(
    "INSERT INTO eva_carried (resource, quantityKg) VALUES (?, ?) " +
      "ON CONFLICT(resource) DO UPDATE SET quantityKg = quantityKg + excluded.quantityKg",
    [resource, quantityKg],
  );
}

export function clearCarriedSync(): void {
  getDb().run("DELETE FROM eva_carried");
}

export function carriedTotalKg(carried: CarriedResource[]): number {
  return carried.reduce((total, entry) => total + entry.quantityKg, 0);
}
