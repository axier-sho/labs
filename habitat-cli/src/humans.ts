import { getDb } from "./db";
import { readModulesSync, type HabitatModule } from "./modules";
import type { StarterHuman } from "./kepler";

// The habitat's crew. Humans are local state: Kepler names them once, in the
// registration response, and never hears about them again. Where each one
// stands, and whether they can move, is entirely the habitat's business.

export type Human = {
  id: string;
  displayName: string;
  locationModuleId: string;
};

// Raised when a caller asks for a move the habitat refuses. The backend maps
// this to a 400/404 so a bad request is answered with a reason, not a stack.
export class HumanValidationError extends Error {}

export async function listHumans(): Promise<Human[]> {
  return readHumansSync();
}

export function readHumansSync(): Human[] {
  return getDb()
    .query(
      "SELECT id, displayName, locationModuleId FROM humans ORDER BY seq",
    )
    .all() as Human[];
}

export async function getHuman(id: string): Promise<Human | null> {
  return readHumanSync(id);
}

export function readHumanSync(id: string): Human | null {
  const row = getDb()
    .query(
      "SELECT id, displayName, locationModuleId FROM humans WHERE id = ?",
    )
    .get(id) as Human | null;

  return row ?? null;
}

// Translate starterHumans into crew rows. Their locationModuleId refers to a
// starter module id as Kepler numbered it, so it must be mapped through the
// same table that renamed the modules themselves. An unmapped id means the
// response is internally inconsistent — throw, so the whole registration rolls
// back rather than seeding a human standing in a module that does not exist.
export function hydrateStarterHumans(
  starterHumans: StarterHuman[],
  localIdByStarterId: Map<string, string>,
): Human[] {
  return starterHumans.map((human) => {
    const locationModuleId = localIdByStarterId.get(human.locationModuleId);

    if (locationModuleId === undefined) {
      throw new Error(
        `Starter human '${human.id}' is assigned to module '${human.locationModuleId}', ` +
          "which is not one of the starter modules in the registration response.",
      );
    }

    return { id: human.id, displayName: human.displayName, locationModuleId };
  });
}

// Replace the whole crew table, in order. No transaction of its own:
// registration hydration wraps this together with the modules and the
// registration row.
export function writeHumansSync(humans: Human[]): void {
  const database = getDb();
  database.run("DELETE FROM humans");

  const insert = database.query(
    "INSERT INTO humans (id, displayName, locationModuleId) VALUES (?, ?, ?)",
  );

  for (const human of humans) {
    insert.run(human.id, human.displayName, human.locationModuleId);
  }
}

export function clearHumansSync(): void {
  getDb().run("DELETE FROM humans");
}

export function setHumanLocationSync(
  humanId: string,
  locationModuleId: string,
): void {
  getDb().run("UPDATE humans SET locationModuleId = ? WHERE id = ?", [
    locationModuleId,
    humanId,
  ]);
}

// Move a human to another module. Connections and activity status are
// deliberately not considered: the only rule is that the destination exists and
// still has room.
export async function moveHuman(
  humanId: string,
  moduleId: string,
): Promise<Human> {
  const human = readHumanSync(humanId);

  if (human === null) {
    throw new HumanValidationError(`Human '${humanId}' was not found.`);
  }

  const modules = readModulesSync();
  const destination = modules.find((candidate) => candidate.id === moduleId);

  if (destination === undefined) {
    throw new HumanValidationError(`Module '${moduleId}' was not found.`);
  }

  if (human.locationModuleId === moduleId) {
    return human;
  }

  requireOpenCrewCapacity(destination, readHumansSync());

  setHumanLocationSync(humanId, moduleId);

  return { ...human, locationModuleId: moduleId };
}

// Deleting a module with someone standing in it would leave that human pointing
// at nothing, so the crew has a veto over module deletion. Callers run this
// before removing a module.
export function requireModuleUnoccupied(moduleId: string): void {
  const occupants = occupantsOf(moduleId, readHumansSync());

  if (occupants.length > 0) {
    const names = occupants
      .map((human) => `${human.displayName} (${human.id})`)
      .join(", ");

    throw new HumanValidationError(
      `Module '${moduleId}' cannot be deleted while it is occupied by ${names}. ` +
        "Move them to another module first.",
    );
  }
}

// A module's crewCapacity comes from its runtimeAttributes, which Kepler
// supplied. A module with no crewCapacity attribute holds nobody.
export function crewCapacityOf(module: HabitatModule): number {
  const value = module.runtimeAttributes.crewCapacity;

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function occupantsOf(moduleId: string, humans: Human[]): Human[] {
  return humans.filter((human) => human.locationModuleId === moduleId);
}

function requireOpenCrewCapacity(
  destination: HabitatModule,
  humans: Human[],
): void {
  const capacity = crewCapacityOf(destination);
  const occupants = occupantsOf(destination.id, humans).length;

  if (occupants >= capacity) {
    throw new HumanValidationError(
      `Module '${destination.id}' has no open crew capacity ` +
        `(${occupants} of ${capacity} occupied).`,
    );
  }
}
