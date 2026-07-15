import { Database } from "bun:sqlite";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

// The Habitat CLI's local, student-side state lives in a single SQLite database
// at the project root. This is the CLI-owned side of the persistence boundary:
// registration, and (over time) modules, inventory, construction, and power
// state move here. Kepler-owned data — the catalog, blueprints, unlocks, world
// state — is NOT stored here; it is always fetched fresh from the planet server.
export const databasePath = resolveDatabasePath();

// The habitat's state belongs to the directory it is run from, so the database
// file is always resolved against the *current* working directory rather than
// captured once at startup. Tests rely on this: they chdir into a temp dir to
// get a clean habitat.
function resolveDatabasePath(): string {
  return join(process.cwd(), "habitat.sqlite");
}

let db: Database | null = null;
let openPath: string | null = null;

// Open (creating if needed) the local SQLite database and make sure the schema
// exists. The connection is memoised so every command shares one handle, and
// reopened if the working directory has moved to a different habitat.
export function getDb(): Database {
  const path = resolveDatabasePath();

  if (db !== null && openPath !== path) {
    db.close();
    db = null;
  }

  if (db === null) {
    openPath = path;
    db = new Database(path, { create: true });
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA foreign_keys = ON;");
    migrate(db);
    importLegacyJsonState(db);
  }

  return db;
}

// Modules and inventory used to live in .habitat/*.json. They moved into SQLite
// so that registration hydration and docking can span tables in one
// transaction. Carry any pre-existing file state over exactly once, then rename
// the file aside so it is never read again but is still recoverable by hand.
function importLegacyJsonState(database: Database): void {
  importLegacyFile(database, "modules.json", (parsed) => {
    if (countRows(database, "modules") > 0 || !Array.isArray(parsed.modules)) {
      return false;
    }

    const insert = database.query(
      "INSERT INTO modules " +
        "(id, blueprintId, displayName, connectedTo, runtimeAttributes, capabilities) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
    );

    for (const value of parsed.modules) {
      const module = value as Record<string, unknown>;
      insert.run(
        String(module.id),
        String(module.blueprintId),
        String(module.displayName),
        JSON.stringify(module.connectedTo ?? []),
        JSON.stringify(module.runtimeAttributes ?? {}),
        JSON.stringify(module.capabilities ?? []),
      );
    }

    return true;
  });

  importLegacyFile(database, "inventory.json", (parsed) => {
    const resources = parsed.resources;

    if (
      countRows(database, "inventory") > 0 ||
      typeof resources !== "object" ||
      resources === null ||
      Array.isArray(resources)
    ) {
      return false;
    }

    const insert = database.query(
      "INSERT INTO inventory (resource, quantity) VALUES (?, ?)",
    );

    for (const [resource, quantity] of Object.entries(
      resources as Record<string, unknown>,
    )) {
      if (typeof quantity === "number" && quantity > 0) {
        insert.run(resource, quantity);
      }
    }

    return true;
  });
}

// Read one legacy JSON file and hand it to `load`. When `load` reports that it
// imported the file, rename it to *.migrated so the next run skips it. A parse
// failure is not fatal: an unreadable legacy file should never stop the CLI from
// starting, it just means there was nothing to carry over.
function importLegacyFile(
  database: Database,
  fileName: string,
  load: (parsed: Record<string, unknown>) => boolean,
): void {
  const path = join(process.cwd(), ".habitat", fileName);

  if (!existsSync(path)) {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return;
  }

  const imported = database.transaction(() => load(parsed))();

  if (imported) {
    renameSync(path, `${path}.migrated`);
    console.log(`[habitat-db] imported .habitat/${fileName} into SQLite`);
  }
}

function countRows(database: Database, table: string): number {
  const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };

  return row.count;
}

// Create tables if they do not exist yet. Every table here is habitat-owned
// local state, so operations that must not half-apply (registration hydration,
// docking) can span them in a single SQLite transaction.
function migrate(database: Database): void {
  // The CLI manages exactly one registered habitat, so the registration table
  // holds a single pinned row (id = 1) that we upsert on.
  database.run(`
    CREATE TABLE IF NOT EXISTS registration (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      habitatId     TEXT NOT NULL,
      habitatUuid   TEXT NOT NULL,
      displayName   TEXT NOT NULL,
      baseUrl       TEXT NOT NULL,
      registeredAt  TEXT NOT NULL
    );
  `);

  // `seq` exists only to give modules a stable listing order (the order Kepler
  // sent them at registration). `id` is the habitat-local module id.
  // connectedTo/runtimeAttributes/capabilities are JSON text: they are opaque
  // blobs to SQL, and nothing queries inside them.
  database.run(`
    CREATE TABLE IF NOT EXISTS modules (
      seq                INTEGER PRIMARY KEY AUTOINCREMENT,
      id                 TEXT NOT NULL UNIQUE,
      blueprintId        TEXT NOT NULL,
      displayName        TEXT NOT NULL,
      connectedTo        TEXT NOT NULL,
      runtimeAttributes  TEXT NOT NULL,
      capabilities       TEXT NOT NULL
    );
  `);

  // One row per material the habitat actually holds. A stack that reaches zero
  // is deleted rather than stored, which the CHECK enforces.
  database.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      resource  TEXT PRIMARY KEY,
      quantity  REAL NOT NULL CHECK (quantity > 0)
    );
  `);

  // The habitat's crew. `id` and `displayName` come from starterHumans in the
  // registration response and are never invented locally. `locationModuleId` is
  // a habitat-local module id, and stays pointed at the suitport while its human
  // is outside on EVA so the crew slot cannot be taken before they dock again.
  database.run(`
    CREATE TABLE IF NOT EXISTS humans (
      seq               INTEGER PRIMARY KEY AUTOINCREMENT,
      id                TEXT NOT NULL UNIQUE,
      displayName       TEXT NOT NULL,
      locationModuleId  TEXT NOT NULL
    );
  `);

  // contracts.alerts from the registration response, kept verbatim so alert
  // records are validated against the definition Kepler actually handed us
  // rather than one hard-coded here.
  database.run(`
    CREATE TABLE IF NOT EXISTS alert_contract (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      schemaVersion  TEXT NOT NULL,
      schema         TEXT NOT NULL
    );
  `);
}
