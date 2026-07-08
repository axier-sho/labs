import type { Command } from "commander";
import { readRegistration } from "../kepler";
import {
  createHabitatModule,
  deleteHabitatModule,
  getHabitatModule,
  listHabitatModules,
  updateHabitatModule,
} from "../modules";
import { moduleDrawKw, totalDrawKw } from "../tick";
import { formatNumber, renderTable } from "../format";
import { parseCondition, reportError } from "../cli";

const MODULE_STATUSES = [
  "offline",
  "idle",
  "online",
  "active",
  "damaged",
] as const;

export function registerModuleCommands(program: Command): void {
  const moduleCommand = program
    .command("module")
    .description("Manage local Habitat module state.");

  moduleCommand
    .command("list")
    .description("List local Habitat modules.")
    .action(async () => {
      try {
        const modules = await listHabitatModules();

        console.log(`Modules: ${modules.length}`);

        if (modules.length === 0) {
          console.log("No local modules found.");
          return;
        }

        for (const module of modules) {
          console.log(
            `${module.id} | ${module.blueprintId} | ${module.displayName}`,
          );
        }
      } catch (error) {
        reportError(program, error);
      }
    });

  moduleCommand
    .command("status")
    .description(
      "Show each module's state and current power draw as a text table.",
    )
    .action(async () => {
      try {
        const modules = await listHabitatModules();

        if (modules.length === 0) {
          console.log("No local modules found.");
          return;
        }

        const rows = modules.map((module) => [
          module.displayName,
          typeof module.runtimeAttributes.status === "string"
            ? module.runtimeAttributes.status
            : "unknown",
          `${formatNumber(moduleDrawKw(module))} kW`,
        ]);

        console.log(renderTable(["Module", "State", "Power draw"], rows));

        const total = totalDrawKw(modules);

        console.log("");
        console.log(`Total power draw: ${formatNumber(total)} kW`);
        console.log(
          `Energy per tick:  ${formatNumber(total / 3600)} kWh (1 tick = 1 simulated second)`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  moduleCommand
    .command("show")
    .description("Show one local Habitat module.")
    .argument("<module-id>", "module identifier")
    .action(async (moduleId: string) => {
      try {
        const module = await getHabitatModule(moduleId);

        if (module === null) {
          throw new Error(`Module '${moduleId}' was not found.`);
        }

        console.log(JSON.stringify(module, null, 2));
      } catch (error) {
        reportError(program, error);
      }
    });

  moduleCommand
    .command("create")
    .description("Create a local Habitat module from a blueprint.")
    .requiredOption("-b, --blueprint-id <blueprintId>", "blueprint identifier")
    .option("-n, --display-name <name>", "module display name")
    .action(async (options: {
      blueprintId: string;
      displayName?: string;
    }) => {
      try {
        const registration = await readRegistration();
        const module = await createHabitatModule({
          blueprintId: options.blueprintId,
          displayName: options.displayName,
          baseUrl: registration?.baseUrl,
        });

        console.log(
          `Created module '${module.displayName}' (${module.id}) from blueprint '${module.blueprintId}'.`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  moduleCommand
    .command("update")
    .description("Update a local Habitat module.")
    .argument("<module-id>", "module identifier")
    .option("-n, --display-name <name>", "module display name")
    .option(
      "-t, --connected-to <moduleIds...>",
      "comma-separated list of connected module ids",
    )
    .option("-s, --status <status>", "module runtime status")
    .option("-c, --condition <condition>", "module runtime condition")
    .action(
      async (
        moduleId: string,
        options: {
          displayName?: string;
          connectedTo?: string[];
          status?: string;
          condition?: string;
        },
      ) => {
        try {
          if (
            options.displayName === undefined &&
            (options.connectedTo === undefined || options.connectedTo.length === 0)
            && options.status === undefined
            && options.condition === undefined
          ) {
            throw new Error("Provide at least one field to update.");
          }

          const module = await updateHabitatModule(moduleId, {
            displayName: options.displayName,
            connectedTo: options.connectedTo,
            status: options.status,
            condition:
              options.condition === undefined
                ? undefined
                : parseCondition(options.condition),
          });

          console.log(`Updated module '${module.displayName}' (${module.id}).`);
        } catch (error) {
          reportError(program, error);
        }
      },
    );

  moduleCommand
    .command("set-status")
    .description("Set a local Habitat module's runtime status.")
    .argument("<module-id>", "module identifier")
    .argument("<status>", `new status (${MODULE_STATUSES.join(", ")})`)
    .action(async (moduleId: string, status: string) => {
      try {
        if (!(MODULE_STATUSES as readonly string[]).includes(status)) {
          throw new Error(
            `Status must be one of: ${MODULE_STATUSES.join(", ")}.`,
          );
        }

        const module = await updateHabitatModule(moduleId, { status });

        console.log(
          `Set ${module.id} status to '${status}' (power draw ${formatNumber(moduleDrawKw(module))} kW).`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  moduleCommand
    .command("delete")
    .description("Delete a local Habitat module.")
    .argument("<module-id>", "module identifier")
    .action(async (moduleId: string) => {
      try {
        const module = await deleteHabitatModule(moduleId);

        console.log(`Deleted module '${module.displayName}' (${module.id}).`);
      } catch (error) {
        reportError(program, error);
      }
    });
}
