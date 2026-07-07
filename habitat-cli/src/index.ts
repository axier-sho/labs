#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import {
  fetchHabitatStatus,
  readRegistration,
  registerHabitat,
  registrationPath,
  unregisterHabitat,
} from "./kepler";
import {
  clearBlueprintCatalog,
  clearHabitatModuleState,
  createHabitatModule,
  deleteHabitatModule,
  getHabitatModule,
  hydrateModulesFromRegistration,
  listHabitatModules,
  updateHabitatModule,
} from "./modules";
import { moduleDrawKw, runPowerTicks, totalDrawKw } from "./tick";

const MODULE_STATUSES = [
  "offline",
  "idle",
  "online",
  "active",
  "damaged",
] as const;

const program = new Command();

program
  .name("habitat")
  .description("Register a habitat with the Kepler planet server.")
  .version(packageJson.version);

program.configureOutput({
  outputError: (message, write) => {
    if (message.includes("unknown command")) {
      write(
        `Habitat does not recognize that command yet.\nRun 'habitat --help' to see what is available.\n\n${message}`,
      );
      return;
    }

    write(message);
  },
});

program.addHelpText(
  "after",
  `
Commands:
  habitat register --name "<habitat name>"   register this habitat with Kepler
  habitat status                             show registration status
  habitat module list                        list local Habitat modules
  habitat module status                      show module states and power draw
  habitat module show <module-id>            show one local Habitat module
  habitat module create --blueprint-id <id>  create a module from a blueprint
  habitat module update <module-id>          update a local Habitat module
  habitat module set-status <id> <status>    set a module's runtime status
  habitat module delete <module-id>          delete a local Habitat module
  habitat tick [count]                       advance the simulation by N ticks
  habitat unregister                         remove this habitat from Kepler

Registration state:
  Saved locally to ${registrationPath}
  Run commands from the same directory to use the same registration.

Module state:
  Saved locally to .habitat/modules.json
  Blueprint catalog cached locally in .habitat/blueprints.json

Config via environment:
  KEPLER_BASE_URL      planet server base URL
                       (default https://planet.turingguild.com)
  KEPLER_PLANET_TOKEN  bearer token sent as 'Authorization: Bearer <token>'
                       (KEPLER_TOKEN also accepted; default admin-dev-token
                       for local development)

Agent discovery:
  habitat --help
  habitat register --help
  habitat status --help
  habitat module --help
  habitat module list --help
  habitat module status --help
  habitat module show --help
  habitat module create --help
  habitat module update --help
  habitat module set-status --help
  habitat module delete --help
  habitat tick --help
  habitat unregister --help
`,
);

program
  .command("register")
  .description("Register this habitat with the Kepler planet server.")
  .requiredOption("-n, --name <name>", "habitat display name")
  .action(async (options: { name: string }) => {
    try {
      const { registration, response } = await registerHabitat(options.name);
      await hydrateModulesFromRegistration({
        starterModules: response.starterModules,
        blueprints: response.blueprints,
      });

      console.log(`Registered habitat '${registration.displayName}' with Kepler.`);
      console.log(`Habitat ID: ${registration.habitatId}`);
      console.log(`Habitat UUID: ${registration.habitatUuid}`);
      console.log(`Starter modules hydrated: ${response.starterModules.length}`);
      console.log(`Blueprints cached: ${response.blueprints.length}`);
      console.log(`Saved registration to ${registrationPath}`);
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("status")
  .description("Show Kepler registration status for this habitat.")
  .action(async () => {
    try {
      const registration = await readRegistration();
      const modules = await listHabitatModules();

      if (registration === null) {
        console.log("Registered: no");
        console.log(`Modules: ${modules.length}`);
        console.log(
          'Run \'habitat register --name "<habitat name>"\' to register.',
        );
        return;
      }

      try {
        const { habitat } = await fetchHabitatStatus();

        console.log("Registered: yes");
        console.log(`Habitat ID: ${habitat.id}`);
        console.log(`Name: ${habitat.displayName}`);
        console.log(`Slug: ${habitat.habitatSlug}`);
        console.log(`Catalog version: ${habitat.catalogVersion}`);
        console.log(`Server status: ${habitat.status}`);
        console.log(`Last seen: ${habitat.lastSeenAt ?? "never"}`);
        console.log(`Modules: ${modules.length}`);
      } catch (error) {
        // Registered locally but the server was unreachable; show what we have.
        console.log("Registered: yes (local record only)");
        console.log(`Habitat ID: ${registration.habitatId}`);
        console.log(`Name: ${registration.displayName}`);
        console.log(`Modules: ${modules.length}`);
        console.log(
          `Could not reach Kepler: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("unregister")
  .description("Unregister this habitat from the Kepler planet server.")
  .action(async () => {
    try {
      const registration = await unregisterHabitat();
      await clearHabitatModuleState();
      await clearBlueprintCatalog();

      console.log(
        `Unregistered habitat '${registration.displayName}' (habitatId ${registration.habitatId}) from Kepler.`,
      );
      console.log(`Removed local registration at ${registrationPath}`);
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("tick")
  .description(
    "Advance the habitat simulation by draining battery power (1 tick = 1 simulated second).",
  )
  .argument("[count]", "number of ticks to advance", "1")
  .action(async (countArg: string) => {
    try {
      const count = parseTickCount(countArg);
      const summary = await runPowerTicks(count);

      const hours = summary.ticks / 3600;
      console.log(
        `Advanced ${summary.ticks} tick${summary.ticks === 1 ? "" : "s"} (${hours.toFixed(2)} simulated hours).`,
      );
      console.log(`Power draw: ${formatNumber(summary.powerDrawKw)} kW`);
      console.log(
        `Energy consumed: ${formatNumber(summary.energyConsumedKwh)} kWh`,
      );

      if (!summary.hasBattery) {
        console.log("Battery: none (no power storage to drain).");
        return;
      }

      console.log(
        `Battery: ${formatNumber(summary.batteryEnergyKwh)} / ${formatNumber(summary.batteryCapacityKwh)} kWh remaining`,
      );

      if (summary.batteryEnergyKwh === 0) {
        console.log("Battery depleted.");
      }
    } catch (error) {
      reportError(error);
    }
  });

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
      reportError(error);
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
      reportError(error);
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
      reportError(error);
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
      reportError(error);
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
        reportError(error);
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
      reportError(error);
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
      reportError(error);
    }
  });

await program.parseAsync();

function reportError(error: unknown): void {
  program.error(error instanceof Error ? error.message : String(error));
}

function parseCondition(value: string): number {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error("Condition must be a number.");
  }

  return parsed;
}

function parseTickCount(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Tick count must be a positive integer.");
  }

  return parsed;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  // Show enough precision that sub-tick energy amounts (draw / 3600) are visible,
  // then trim trailing zeros so common values stay readable (e.g. "6.5", "493.5").
  return Number(value.toFixed(4)).toString();
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );

  const formatRow = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();

  const divider = widths.map((width) => "-".repeat(width)).join("  ");

  return [formatRow(headers), divider, ...rows.map(formatRow)].join("\n");
}
