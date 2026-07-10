import type { Command } from "commander";
import type {
  BlueprintCatalogResponse,
  ProductionBlueprint,
  ResourceCatalogResponse,
} from "../kepler";
import {
  formatBlueprintDetails,
  formatBlueprintTable,
  formatResourceTable,
} from "../catalog";
import { apiGet } from "../api-client";
import { reportError } from "../cli";

// Catalog reads now go through the local backend, which proxies Kepler. The CLI
// fetches the JSON and formats it with the same pure formatters as before — no
// catalog data is hard-coded here.

export function registerCatalogCommands(program: Command): void {
  const blueprintCommand = program
    .command("blueprint")
    .description("Browse the read-only Kepler blueprint catalog.");

  blueprintCommand
    .command("list")
    .description("List available blueprints from the Kepler catalog.")
    .action(async () => {
      try {
        const { blueprints } = await apiGet<BlueprintCatalogResponse>(
          "/catalog/blueprints",
        );
        console.log(formatBlueprintTable(blueprints));
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
        const { blueprint } = await apiGet<{ blueprint: ProductionBlueprint }>(
          `/catalog/blueprints/${encodeURIComponent(blueprintId)}`,
        );
        console.log(formatBlueprintDetails(blueprint));
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
        const { resources } = await apiGet<ResourceCatalogResponse>(
          "/catalog/resources",
        );
        console.log(formatResourceTable(resources));
      } catch (error) {
        reportError(program, error);
      }
    });
}
