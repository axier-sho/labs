import type { Command } from "commander";
import {
  formatBlueprintDetails,
  formatBlueprintTable,
  formatResourceTable,
  listBlueprints,
  listResources,
  showBlueprint,
} from "../catalog";
import { reportError } from "../cli";

export function registerCatalogCommands(program: Command): void {
  const blueprintCommand = program
    .command("blueprint")
    .description("Browse the read-only Kepler blueprint catalog.");

  blueprintCommand
    .command("list")
    .description("List available blueprints from the Kepler catalog.")
    .action(async () => {
      try {
        console.log(formatBlueprintTable(await listBlueprints()));
      } catch (error) {
        reportError(program, error);
      }
    });

  blueprintCommand
    .command("show")
    .description("Show details for one Kepler blueprint.")
    .argument("<blueprint-id>", "blueprint identifier")
    .action(async (blueprintId: string) => {
      try {
        console.log(formatBlueprintDetails(await showBlueprint(blueprintId)));
      } catch (error) {
        reportError(program, error);
      }
    });

  const resourceCommand = program
    .command("resource")
    .description("Browse the read-only Kepler resource catalog.");

  resourceCommand
    .command("list")
    .description("List resource types defined in the Kepler catalog.")
    .action(async () => {
      try {
        console.log(formatResourceTable(await listResources()));
      } catch (error) {
        reportError(program, error);
      }
    });
}
