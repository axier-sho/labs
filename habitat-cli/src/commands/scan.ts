import { InvalidArgumentError, type Command } from "commander";
import type {
  WorldScanQuantityEstimate,
  WorldScanResponse,
  WorldScanTile,
} from "../kepler";
import { apiGet } from "../api-client";
import { formatNumber, renderTable } from "../format";
import { reportError } from "../cli";

// `habitat scan` reports where the operator is and how strong the sensor is;
// Kepler answers with what is probably there. The command never talks to Kepler
// directly and never passes a habitatId — the local Habitat API supplies that
// from the saved registration.

const MAX_SENSOR_STRENGTH = 100;
const MAX_RADIUS_TILES = 5;

// Kepler uses a null resourceType for the "this tile is empty" candidate.
const NONE_CANDIDATE = "none";

export function registerScanCommands(program: Command): void {
  program
    .command("scan")
    .description("Scan for nearby resources with Kepler's sensor model.")
    .requiredOption("--x <integer>", "current x coordinate", parseCoordinate)
    .requiredOption("--y <integer>", "current y coordinate", parseCoordinate)
    .requiredOption(
      "--strength <0-100>",
      "effective sensor strength",
      (value) => parseBounded(value, "Sensor strength", 0, MAX_SENSOR_STRENGTH),
    )
    .option(
      "--radius <0-5>",
      "scan radius in tiles",
      (value) => parseBounded(value, "Scan radius", 0, MAX_RADIUS_TILES),
      0,
    )
    .option("--json", "print the complete JSON response")
    .action(
      async (options: {
        x: number;
        y: number;
        strength: number;
        radius: number;
        json?: boolean;
      }) => {
        try {
          const query = new URLSearchParams({
            x: String(options.x),
            y: String(options.y),
            sensorStrength: String(options.strength),
            radiusTiles: String(options.radius),
          });

          const body = await apiGet<WorldScanResponse>(
            `/world/scan?${query.toString()}`,
          );

          if (options.json === true) {
            console.log(JSON.stringify(body, null, 2));
            return;
          }

          printScan(body);
        } catch (error) {
          reportError(program, error);
        }
      },
    );
}

function printScan({ scan }: WorldScanResponse): void {
  console.log(`Position: (${scan.origin.x}, ${scan.origin.y})`);
  console.log(`Sensor strength: ${scan.sensorStrength}`);
  console.log(`Scan radius: ${scan.radiusTiles} tile(s)`);
  console.log(`Sensor model: ${scan.modelVersion}`);
  console.log("");

  if (scan.tiles.length === 0) {
    console.log("Kepler returned no tiles for this position.");
    return;
  }

  // One tile is a close look, so show the whole distribution. More than one is
  // a survey, so show a row per tile and let the operator pick where to look
  // closer with a radius 0 scan.
  if (scan.tiles.length === 1) {
    printTileDetail(scan.tiles[0]!);
    return;
  }

  printTileSummary(scan.tiles);
}

function printTileDetail(tile: WorldScanTile): void {
  console.log(`Tile (${tile.x}, ${tile.y})`);
  console.log(`Terrain: ${tile.terrain}`);
  console.log(`Distance: ${formatNumber(tile.distanceTiles)} tile(s)`);
  console.log("");

  const rows = tile.probabilities.map((candidate) => [
    candidateName(candidate.resourceType),
    formatPercent(candidate.probabilityPct),
  ]);

  console.log(renderTable(["Resource", "Probability"], rows));
  console.log("");

  console.log(
    `Most likely: ${candidateName(tile.topCandidate.resourceType)} ` +
      `(${formatPercent(tile.topCandidate.probabilityPct)} confidence)`,
  );
  console.log(`Estimated quantity: ${describeQuantity(tile.quantityEstimate)}`);

  if (tile.quantityEstimate === null) {
    console.log(
      "The most likely result is an empty tile, so there is nothing to estimate.",
    );
  } else if (tile.quantityEstimate.exact) {
    console.log(
      "Sensor strength 100 at distance 0: this reading is exact, not an estimate.",
    );
  }
}

function printTileSummary(tiles: WorldScanTile[]): void {
  const rows = tiles.map((tile) => [
    `(${tile.x}, ${tile.y})`,
    formatNumber(tile.distanceTiles),
    tile.terrain,
    candidateName(tile.topCandidate.resourceType),
    formatPercent(tile.topCandidate.probabilityPct),
    describeQuantity(tile.quantityEstimate),
  ]);

  console.log(
    renderTable(
      [
        "Tile",
        "Distance",
        "Terrain",
        "Top candidate",
        "Confidence",
        "Estimated quantity",
      ],
      rows,
    ),
  );
  console.log("");
  console.log(
    `${tiles.length} tile(s) scanned. Scan a single tile with --radius 0 to see its full probability table.`,
  );
}

function candidateName(resourceType: string | null): string {
  return resourceType ?? NONE_CANDIDATE;
}

// An empty tile has no quantity to estimate, so Kepler sends null rather than
// inventing kilograms. Say so instead of printing "0 kg".
function describeQuantity(estimate: WorldScanQuantityEstimate | null): string {
  if (estimate === null) {
    return "-";
  }

  const amount = `${formatNumber(estimate.estimatedKg)} ${estimate.unit}`;

  if (estimate.exact) {
    return `${amount} (exact)`;
  }

  return (
    `${amount} (range ${formatNumber(estimate.minimumKg)}-` +
    `${formatNumber(estimate.maximumKg)} ${estimate.unit})`
  );
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function parseCoordinate(value: string): number {
  const parsed = toNumber(value);

  if (!Number.isInteger(parsed)) {
    throw new InvalidArgumentError("Coordinates must be integers.");
  }

  return parsed;
}

function parseBounded(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = toNumber(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new InvalidArgumentError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }

  return parsed;
}

// Number("") is 0, which would silently turn `--x ""` into a valid coordinate.
function toNumber(value: string): number {
  return value.trim() === "" ? NaN : Number(value);
}
