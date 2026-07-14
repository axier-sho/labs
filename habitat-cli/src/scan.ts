import {
  fetchWorldScan,
  readRegistration,
  type WorldScanResponse,
} from "./kepler";

// Read-only resource scanning. This module owns the rule that the Habitat
// supplies the operator's position and effective sensor strength, while Kepler
// owns the hidden resource truth and the remaining quantity. Nothing here is
// persisted: a scan is an estimate, not a fact, so there is no local state to
// keep in sync.

export type ScanOptions = {
  x: number;
  y: number;
  sensorStrength: number;
  radiusTiles: number;
};

// Raised when the caller's scan options are outside Kepler's contract. The
// backend maps this to a 400 so a bad request never reaches Kepler.
export class ScanValidationError extends Error {}

const MAX_SENSOR_STRENGTH = 100;
const MAX_RADIUS_TILES = 5;

export async function requestWorldScan(
  options: ScanOptions,
): Promise<WorldScanResponse> {
  const { x, y, sensorStrength, radiusTiles } = validateScanOptions(options);

  const registration = await readRegistration();

  if (registration === null) {
    throw new ScanValidationError(
      "This habitat is not registered yet.\n" +
        "Run 'habitat register --name \"<habitat name>\"' first.",
    );
  }

  // The habitatId comes from the saved registration, never from the caller:
  // scanning is something *this* habitat does from its own position.
  return fetchWorldScan(
    {
      habitatId: registration.habitatId,
      x,
      y,
      sensorStrength,
      radiusTiles,
    },
    registration.baseUrl,
  );
}

export function validateScanOptions(options: ScanOptions): ScanOptions {
  const x = requireInteger(options.x, "x");
  const y = requireInteger(options.y, "y");
  const sensorStrength = requireIntegerInRange(
    options.sensorStrength,
    "Sensor strength",
    0,
    MAX_SENSOR_STRENGTH,
  );
  const radiusTiles = requireIntegerInRange(
    options.radiusTiles,
    "Scan radius",
    0,
    MAX_RADIUS_TILES,
  );

  return { x, y, sensorStrength, radiusTiles };
}

function requireInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new ScanValidationError(`Coordinate ${name} must be an integer.`);
  }

  return value;
}

function requireIntegerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ScanValidationError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }

  return value;
}
