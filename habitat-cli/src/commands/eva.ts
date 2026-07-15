import { InvalidArgumentError, type Command } from "commander";
import type { CarriedResource } from "../eva-state";
import type { EvaStatus } from "../eva";
import { apiGet, apiPost } from "../api-client";
import { formatNumber, renderTable } from "../format";
import { reportError } from "../cli";

// `habitat eva` drives the one human who is outside. Positions are never passed
// to Kepler by this command — the backend reads them from saved state — and the
// CLI's job is only to say what happened in a way a person can read.

type DockResult = {
  status: EvaStatus;
  unloaded: CarriedResource[];
  humanId: string;
  suitportModuleId: string;
};

type CollectResult = {
  status: EvaStatus;
  resourceType: string;
  collectedKg: number;
  remainingKg: number;
};

export function registerEvaCommands(program: Command): void {
  const evaCommand = program
    .command("eva")
    .description("Send a human outside and explore the Kepler grid.");

  evaCommand
    .command("status")
    .description("Show who is outside, where they are, and what they carry.")
    .option("--json", "print the complete JSON response")
    .action(async (options: { json?: boolean }) => {
      try {
        const { eva } = await apiGet<{ eva: EvaStatus }>("/eva");

        if (options.json === true) {
          console.log(JSON.stringify(eva, null, 2));
          return;
        }

        printEvaStatus(eva);
      } catch (error) {
        reportError(program, error);
      }
    });

  evaCommand
    .command("deploy")
    .description("Send one human outside through the suitport, starting at (0, 0).")
    .argument("<human-id>", "id of the human to send outside")
    .action(async (humanId: string) => {
      try {
        const { eva } = await apiPost<{ eva: EvaStatus }>("/eva/deploy", {
          humanId,
        });

        console.log(
          `${describeExplorer(eva)} is outside at (${eva.position?.x}, ${eva.position?.y}), ` +
            `carrying up to ${formatNumber(eva.maxCarryKg ?? 0)} kg.`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  evaCommand
    .command("move")
    .description("Move the explorer exactly one tile north, south, east or west.")
    .argument("<x>", "destination x coordinate", parseCoordinate)
    .argument("<y>", "destination y coordinate", parseCoordinate)
    .action(async (x: number, y: number) => {
      try {
        const { eva } = await apiPost<{ eva: EvaStatus }>("/eva/move", { x, y });

        console.log(
          `${describeExplorer(eva)} moved to (${eva.position?.x}, ${eva.position?.y}).`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  evaCommand
    .command("dock")
    .description("Dock at (0, 0) and unload carried material into the habitat.")
    .action(async () => {
      try {
        const result = await apiPost<DockResult>("/eva/dock");

        printDock(result);
      } catch (error) {
        reportError(program, error);
      }
    });

  // `habitat collect` is a top-level command rather than `habitat eva collect`
  // because the lab's command contract says so; it is still an EVA action and
  // goes to the same place.
  program
    .command("collect")
    .description("Collect material from the tile the explorer is standing on.")
    .argument("<quantity-kg>", "positive whole number of kilograms", parseQuantity)
    .action(async (quantityKg: number) => {
      try {
        const result = await apiPost<CollectResult>("/eva/collect", {
          quantityKg,
        });

        console.log(
          `Collected ${formatNumber(result.collectedKg)} kg of ${result.resourceType}. ` +
            `${formatNumber(result.remainingKg)} kg left on this tile.`,
        );
        console.log(
          `Carrying ${formatNumber(result.status.carriedTotalKg)} of ` +
            `${formatNumber(result.status.maxCarryKg ?? 0)} kg.`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });
}

function printEvaStatus(eva: EvaStatus): void {
  if (!eva.deployed) {
    console.log("Deployed: nobody");
    console.log(
      "Send someone outside with 'habitat eva deploy <human-id>' once they are in the suitport.",
    );
    return;
  }

  console.log(`Deployed: ${describeExplorer(eva)}`);
  console.log(`Position: (${eva.position?.x}, ${eva.position?.y})`);
  console.log(`Suitport: ${eva.suitportModuleId}`);
  console.log(
    `Carrying: ${formatNumber(eva.carriedTotalKg)} of ${formatNumber(eva.maxCarryKg ?? 0)} kg ` +
      `(${formatNumber(eva.remainingCapacityKg ?? 0)} kg free)`,
  );

  if (eva.carried.length === 0) {
    console.log("Nothing collected yet.");
    return;
  }

  console.log("");
  console.log(
    renderTable(
      ["Resource", "Carried (kg)"],
      eva.carried.map((entry) => [
        entry.resource,
        formatNumber(entry.quantityKg),
      ]),
    ),
  );
}

function printDock({ unloaded, humanId, suitportModuleId }: DockResult): void {
  console.log(`Docked at (0, 0). ${humanId} is back in ${suitportModuleId}.`);

  if (unloaded.length === 0) {
    console.log("Nothing was carried, so local inventory is unchanged.");
    return;
  }

  console.log("");
  console.log(
    renderTable(
      ["Resource", "Returned (kg)"],
      unloaded.map((entry) => [entry.resource, formatNumber(entry.quantityKg)]),
    ),
  );
  console.log("");
  console.log("Check it landed with 'habitat inventory list'.");
}

function parseCoordinate(value: string): number {
  const parsed = toNumber(value);

  if (!Number.isInteger(parsed)) {
    throw new InvalidArgumentError("Coordinates must be whole numbers.");
  }

  return parsed;
}

function parseQuantity(value: string): number {
  const parsed = toNumber(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(
      "Quantity must be a positive whole number of kilograms.",
    );
  }

  return parsed;
}

function describeExplorer(eva: EvaStatus): string {
  return eva.human === null
    ? "The explorer"
    : `${eva.human.displayName} (${eva.human.id})`;
}

// Number("") is 0, which would silently turn 'habitat eva move "" 1' into (0, 1).
function toNumber(value: string): number {
  return value.trim() === "" ? NaN : Number(value);
}
