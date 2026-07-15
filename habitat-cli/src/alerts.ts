import { getDb } from "./db";
import type { AlertContract } from "./kepler";

// Alerts are habitat state. Kepler publishes the *definition* of an alert in
// contracts.alerts at registration and then stays out of it: opening,
// deduplicating, acknowledging and resolving are all local.

// The registered contract, kept verbatim so the shape we persist is the shape
// Kepler asked for rather than one invented here.
export function writeAlertContractSync(contract: AlertContract): void {
  getDb().run(
    "INSERT INTO alert_contract (id, schemaVersion, schema) VALUES (1, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "schemaVersion = excluded.schemaVersion, schema = excluded.schema",
    [contract.schemaVersion, JSON.stringify(contract.schema ?? {})],
  );
}

export function clearAlertContractSync(): void {
  getDb().run("DELETE FROM alert_contract");
}

export async function readAlertContract(): Promise<AlertContract | null> {
  const row = getDb()
    .query("SELECT schemaVersion, schema FROM alert_contract WHERE id = 1")
    .get() as { schemaVersion: string; schema: string } | null;

  if (row === null) {
    return null;
  }

  return {
    schemaVersion: row.schemaVersion,
    schema: JSON.parse(row.schema) as Record<string, unknown>,
  };
}
