import type { Command } from "commander";
import type { InventoryEntry } from "../inventory";
import { apiGet, apiPost } from "../api-client";
import { formatNumber, renderTable } from "../format";
import { reportError } from "../cli";

export function registerInventoryCommands(program: Command): void {
  const inventoryCommand = program
    .command("inventory")
    .description("Manage the local material inventory used for construction.");

  inventoryCommand
    .command("list")
    .description("List the materials currently held in local inventory.")
    .action(async () => {
      try {
        const { inventory: entries } = await apiGet<{
          inventory: InventoryEntry[];
        }>("/inventory");

        if (entries.length === 0) {
          console.log("Inventory is empty. Add materials with 'habitat inventory add <resource> <quantity>'.");
          return;
        }

        const rows = entries.map((entry) => [
          entry.resource,
          formatNumber(entry.quantity),
        ]);

        console.log(renderTable(["Resource", "Quantity"], rows));
      } catch (error) {
        reportError(program, error);
      }
    });

  inventoryCommand
    .command("add")
    .description("Add a quantity of a material to local inventory.")
    .argument("<resource>", "resource id, e.g. ferrite")
    .argument("<quantity>", "positive whole number of units to add")
    .action(async (resource: string, quantityArg: string) => {
      try {
        const quantity = parseQuantity(quantityArg);
        const { entry } = await apiPost<{ entry: InventoryEntry }>(
          "/inventory",
          { resource, quantity },
        );

        console.log(
          `Added ${formatNumber(quantity)} ${entry.resource}. New total: ${formatNumber(entry.quantity)}.`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });
}

function parseQuantity(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }

  return parsed;
}
