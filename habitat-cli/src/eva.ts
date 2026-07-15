import { getDb } from "./db";
import { ALERT_CODES, observeAlertSync, resolveAlertsSync } from "./alerts";
import {
  addCarriedSync,
  carriedTotalKg,
  clearCarriedSync,
  clearEvaSync,
  readCarriedSync,
  readEvaSync,
  setEvaPositionSync,
  writeEvaSync,
  type CarriedResource,
  type EvaRecord,
} from "./eva-state";
import { addInventorySync } from "./inventory";
import { readHumanSync, setHumanLocationSync, type Human } from "./humans";
import { readModulesSync, type HabitatModule } from "./modules";
import {
  KeplerHttpError,
  collectFromWorld,
  fetchCurrentSector,
  readRegistration,
  type SectorBounds,
} from "./kepler";

// Extravehicular activity: one human, outside, on Kepler's tile grid.
//
// Everything in this file except the Kepler call in `collect` is habitat-owned
// state. Kepler is never asked where our explorer is — it is told, from the
// position saved here. That is the whole point of persisting the position
// rather than accepting coordinates from the caller.

// The suitport is found by capability, not by blueprint id or display name, so
// a habitat that later builds a better airlock still works.
const SUITPORT_CAPABILITY = "suitport-access";

// Kepler grades a suitport's cargo handling with a word, not a number. Until it
// publishes an explicit kilogram limit, that word is mapped to one here. This
// is the only place the mapping exists.
const CARGO_RATING_CAPACITY_KG: Record<string, number> = {
  poor: 10,
  fair: 25,
  good: 50,
  excellent: 100,
};

// An unrecognised rating gets the most conservative limit rather than an error:
// a new rating word should mean "carry less until someone looks at it", not
// "nobody may go outside".
const FALLBACK_CAPACITY_KG = 10;

export class EvaValidationError extends Error {}

// A collection the habitat was right to attempt and Kepler still said no to.
// Distinct from EvaValidationError's other causes because it is the one failure
// mode that is worth an alert: local rules passed, and the world disagreed.
export class CollectionRefusedError extends EvaValidationError {}

export type EvaStatus = {
  deployed: boolean;
  human: Human | null;
  suitportModuleId: string | null;
  position: { x: number; y: number } | null;
  carried: CarriedResource[];
  carriedTotalKg: number;
  maxCarryKg: number | null;
  remainingCapacityKg: number | null;
};

export async function getEvaStatus(): Promise<EvaStatus> {
  const eva = readEvaSync();
  const carried = readCarriedSync();
  const totalKg = carriedTotalKg(carried);

  if (eva === null) {
    return {
      deployed: false,
      human: null,
      suitportModuleId: null,
      position: null,
      carried,
      carriedTotalKg: totalKg,
      maxCarryKg: null,
      remainingCapacityKg: null,
    };
  }

  return {
    deployed: true,
    human: readHumanSync(eva.deployedHumanId),
    suitportModuleId: eva.suitportModuleId,
    position: { x: eva.x, y: eva.y },
    carried,
    carriedTotalKg: totalKg,
    maxCarryKg: eva.maxCarryKg,
    remainingCapacityKg: Math.max(0, eva.maxCarryKg - totalKg),
  };
}

// Send one human outside through the suitport. They start at the habitat's own
// tile, (0, 0), and stay listed as occupying the suitport while they are away —
// the crew slot is held for them so their way back in cannot be taken.
export async function deployHuman(humanId: string): Promise<EvaStatus> {
  const existing = readEvaSync();

  if (existing !== null) {
    const current = readHumanSync(existing.deployedHumanId);
    const who =
      current === null
        ? existing.deployedHumanId
        : `${current.displayName} (${current.id})`;

    throw new EvaValidationError(
      `${who} is already outside at (${existing.x}, ${existing.y}). ` +
        "Only one human may be deployed at a time — dock them first.",
    );
  }

  const human = readHumanSync(humanId);

  if (human === null) {
    throw new EvaValidationError(`Human '${humanId}' was not found.`);
  }

  const suitport = findSuitport(readModulesSync());

  if (human.locationModuleId !== suitport.id) {
    throw new EvaValidationError(
      `${human.displayName} (${human.id}) is in '${human.locationModuleId}' and cannot ` +
        `deploy from there. Move them to the suitport first:\n` +
        `  habitat human move ${human.id} ${suitport.id}`,
    );
  }

  const now = new Date().toISOString();
  const maxCarryKg = carryCapacityOf(suitport);

  getDb().transaction(() => {
    writeEvaSync({
      deployedHumanId: human.id,
      suitportModuleId: suitport.id,
      x: 0,
      y: 0,
      maxCarryKg,
      deployedAt: now,
      updatedAt: now,
    });
    // A fresh EVA starts with an empty satchel. Anything left behind by an
    // earlier one would otherwise be counted against this explorer's capacity.
    clearCarriedSync();

    // Someone being outside is a standing condition, not an event: it opens here
    // and stays open until they dock.
    observeAlertSync({
      code: ALERT_CODES.humanDeployed,
      title: "Human outside the habitat",
      description: `${human.displayName} (${human.id}) is on EVA and is not inside the habitat.`,
      severity: "info",
      source: "eva",
      subject: { type: "human", id: human.id },
      details: { suitportModuleId: suitport.id, maxCarryKg },
    });
  })();

  return getEvaStatus();
}

// Move exactly one tile north, south, east or west, and only within the sector
// Kepler currently assigns this habitat.
export async function moveExplorer(x: number, y: number): Promise<EvaStatus> {
  const eva = requireDeployed();
  const target = { x: requireInteger(x, "x"), y: requireInteger(y, "y") };

  requireSingleStep(eva, target);
  await requireWithinSector(target);

  setEvaPositionSync(target.x, target.y, new Date().toISOString());

  return getEvaStatus();
}

// Collect material from the tile the explorer is actually standing on. Local
// rules are checked first so an impossible request never reaches Kepler; Kepler
// then decides what is there and how much is left, and only a success is
// recorded locally.
export async function collectMaterial(quantityKg: number): Promise<{
  status: EvaStatus;
  resourceType: string;
  collectedKg: number;
  remainingKg: number;
}> {
  const eva = requireDeployed();

  if (!Number.isInteger(quantityKg) || quantityKg <= 0) {
    throw new EvaValidationError(
      "Quantity to collect must be a positive whole number of kilograms.",
    );
  }

  const carriedKg = carriedTotalKg(readCarriedSync());
  const remainingCapacityKg = eva.maxCarryKg - carriedKg;

  if (quantityKg > remainingCapacityKg) {
    throw new EvaValidationError(
      `Collecting ${quantityKg} kg would exceed the suit's carrying capacity: ` +
        `carrying ${formatKg(carriedKg)} of ${formatKg(eva.maxCarryKg)} kg, ` +
        `${formatKg(remainingCapacityKg)} kg free.`,
    );
  }

  const registration = await requireRegistration();

  // Past this line the request is locally valid, so a refusal is Kepler's answer
  // about the world — an empty tile, or not enough left — rather than our
  // mistake. Nothing local is written until it says yes.
  const collection = await collectAtTile(registration, eva, quantityKg);

  getDb().transaction(() => {
    addCarriedSync(collection.resourceType, collection.collectedKg);

    // The material is in the satchel, so whatever Kepler refused before is no
    // longer the situation.
    resolveAlertsSync(ALERT_CODES.collectionRefused, {
      type: "human",
      id: eva.deployedHumanId,
    });

    const nowCarryingKg = carriedTotalKg(readCarriedSync());

    if (nowCarryingKg >= eva.maxCarryKg) {
      observeAlertSync({
        code: ALERT_CODES.carryCapacityReached,
        title: "Suit carrying capacity reached",
        description:
          `The explorer is carrying ${formatKg(nowCarryingKg)} kg of a ` +
          `${formatKg(eva.maxCarryKg)} kg limit and cannot collect any more. ` +
          "Dock at (0, 0) to unload.",
        severity: "warning",
        source: "eva",
        subject: { type: "human", id: eva.deployedHumanId },
        details: { carriedKg: nowCarryingKg, maxCarryKg: eva.maxCarryKg },
      });
    }
  })();

  return {
    status: await getEvaStatus(),
    resourceType: collection.resourceType,
    collectedKg: collection.collectedKg,
    remainingKg: collection.remainingKg,
  };
}

// Ask Kepler for the material. A 4xx here is a verdict about the tile, not a
// transport failure, so it is translated into a refusal the operator can act on
// instead of surfacing as a gateway error with a JSON blob attached.
async function collectAtTile(
  registration: { habitatId: string; baseUrl: string },
  eva: EvaRecord,
  quantityKg: number,
) {
  try {
    return await collectFromWorld(
      {
        habitatId: registration.habitatId,
        x: eva.x,
        y: eva.y,
        quantityKg,
      },
      registration.baseUrl,
    );
  } catch (error) {
    if (
      error instanceof KeplerHttpError &&
      error.status >= 400 &&
      error.status < 500
    ) {
      const reason = error.keplerMessage ?? "no reason given";

      // Worth an alert precisely because local validation already passed: the
      // habitat believed this would work and the world disagreed, which is the
      // kind of surprise an operator wants a record of.
      observeAlertSync({
        code: ALERT_CODES.collectionRefused,
        title: "Collection refused by Kepler",
        description:
          `A locally valid request for ${quantityKg} kg at ` +
          `(${eva.x}, ${eva.y}) was refused: ${reason}`,
        severity: "warning",
        source: "eva.collect",
        subject: { type: "human", id: eva.deployedHumanId },
        details: {
          x: eva.x,
          y: eva.y,
          requestedKg: quantityKg,
          keplerStatus: error.status,
          reason,
        },
      });

      throw new CollectionRefusedError(
        `Kepler refused to hand over ${quantityKg} kg at (${eva.x}, ${eva.y}): ${reason}`,
      );
    }

    throw error;
  }
}

// Come home. Docking is only legal on the habitat's own tile, and it is the
// single moment where carried material becomes habitat inventory. All four
// effects commit together: a crash midway must not leave the satchel emptied
// into a habitat that never received it, nor a human listed as both docked and
// outside.
export async function dockExplorer(): Promise<{
  status: EvaStatus;
  unloaded: CarriedResource[];
  humanId: string;
  suitportModuleId: string;
}> {
  const eva = requireDeployed();

  if (eva.x !== 0 || eva.y !== 0) {
    throw new EvaValidationError(
      `Docking is only possible at the habitat, (0, 0). The explorer is at ` +
        `(${eva.x}, ${eva.y}) — walk back one tile at a time.`,
    );
  }

  const unloaded = readCarriedSync();

  getDb().transaction(() => {
    for (const entry of unloaded) {
      addInventorySync({ [entry.resource]: entry.quantityKg });
    }
    clearCarriedSync();
    setHumanLocationSync(eva.deployedHumanId, eva.suitportModuleId);
    clearEvaSync();

    // The EVA is over, so every condition that only existed because of it is
    // over too. Resolving them here — inside the same commit — is what keeps the
    // alert list honest: there is no instant where the habitat shows nobody
    // outside and still warns that someone is.
    const subject = { type: "human", id: eva.deployedHumanId } as const;
    resolveAlertsSync(ALERT_CODES.humanDeployed, subject);
    resolveAlertsSync(ALERT_CODES.carryCapacityReached, subject);
    resolveAlertsSync(ALERT_CODES.collectionRefused, subject);
  })();

  return {
    status: await getEvaStatus(),
    unloaded,
    humanId: eva.deployedHumanId,
    suitportModuleId: eva.suitportModuleId,
  };
}

// The saved position, for callers that must act from where the explorer really
// is rather than from coordinates they were handed. Scanning uses this.
export function requireExplorerPosition(): { x: number; y: number } {
  const eva = requireDeployed();

  return { x: eva.x, y: eva.y };
}

export function readDeployedHumanId(): string | null {
  return readEvaSync()?.deployedHumanId ?? null;
}

function requireDeployed(): EvaRecord {
  const eva = readEvaSync();

  if (eva === null) {
    throw new EvaValidationError(
      "Nobody is outside right now.\n" +
        "Deploy a human from the suitport first: 'habitat eva deploy <human-id>'.",
    );
  }

  return eva;
}

async function requireRegistration() {
  const registration = await readRegistration();

  if (registration === null) {
    throw new EvaValidationError(
      "This habitat is not registered yet.\n" +
        "Run 'habitat register --name \"<habitat name>\"' first.",
    );
  }

  return registration;
}

// One tile, orthogonally. Manhattan distance of exactly 1 rejects staying put,
// diagonals (distance 2) and jumps (distance > 1) in a single check.
function requireSingleStep(
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

  if (distance === 0) {
    throw new EvaValidationError(
      `The explorer is already at (${to.x}, ${to.y}).`,
    );
  }

  if (distance !== 1) {
    throw new EvaValidationError(
      `(${to.x}, ${to.y}) is not one tile from (${from.x}, ${from.y}). ` +
        "Each move must be exactly one tile north, south, east or west — " +
        "no diagonals and no jumps.",
    );
  }
}

async function requireWithinSector(target: {
  x: number;
  y: number;
}): Promise<void> {
  const registration = await requireRegistration();
  const sector = await fetchCurrentSector(
    registration.habitatId,
    registration.baseUrl,
  );

  if (!isWithinBounds(target, sector.bounds)) {
    const { minX, maxX, minY, maxY } = sector.bounds;

    throw new EvaValidationError(
      `(${target.x}, ${target.y}) is outside sector '${sector.displayName}', ` +
        `which spans x ${minX}..${maxX} and y ${minY}..${maxY}.`,
    );
  }
}

function isWithinBounds(
  target: { x: number; y: number },
  bounds: SectorBounds,
): boolean {
  return (
    target.x >= bounds.minX &&
    target.x <= bounds.maxX &&
    target.y >= bounds.minY &&
    target.y <= bounds.maxY
  );
}

export function findSuitport(modules: HabitatModule[]): HabitatModule {
  const suitports = modules.filter((module) =>
    module.capabilities.includes(SUITPORT_CAPABILITY),
  );

  if (suitports.length === 0) {
    throw new EvaValidationError(
      `This habitat has no module with the '${SUITPORT_CAPABILITY}' capability, ` +
        "so nobody can get outside.",
    );
  }

  return suitports[0]!;
}

export function carryCapacityOf(suitport: HabitatModule): number {
  const explicit = suitport.runtimeAttributes.cargoCapacityKg;

  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const rating = suitport.runtimeAttributes.cargoTransferRating;

  if (typeof rating === "string" && rating in CARGO_RATING_CAPACITY_KG) {
    return CARGO_RATING_CAPACITY_KG[rating]!;
  }

  return FALLBACK_CAPACITY_KG;
}

function requireInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new EvaValidationError(`Coordinate ${name} must be a whole number.`);
  }

  return value;
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
