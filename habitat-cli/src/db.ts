import { Database } from "bun:sqlite";
import { join } from "node:path";

// The Habitat CLI's local, student-side state lives in a single SQLite database
// at the project root. This is the CLI-owned side of the persistence boundary:
// registration, and (over time) modules, inventory, construction, and power
// state move here. Kepler-owned data — the catalog, blueprints, unlocks, world
// state — is NOT stored here; it is always fetched fresh from the planet server.
export const databasePath = join(process.cwd(), "habitat.sqlite");

let db: Database | null = null;

// Open (creating if needed) the local SQLite database and make sure the schema
// exists. The connection is memoised so every command shares one handle.
export function getDb(): Database {
  if (db === null) {
    db = new Database(databasePath, { create: true });
    db.run("PRAGMA journal_mode = WAL;");
    migrate(db);
  }

  return db;
}

// Create tables if they do not exist yet. Kept intentionally small: this lab
// migrates registration first, and later state gains its own tables here.
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
}
