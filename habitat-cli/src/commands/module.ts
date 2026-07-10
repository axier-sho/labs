import type { Command } from "commander";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api-client";
import { moduleDrawKw, totalDrawKw } from "../tick";
import { readConstructionJob, type ConstructionJob } from "../construction";
import { formatNumber, renderTable } from "../format";
import { parseCondition, reportError } from "../cli";
import type { HabitatModule } from "../modules";

// Local module state now lives behind the backend. These helpers keep the HTTP
// shape in one place; the command handlers below still own validation and the
// human-facing output (including the power-draw maths, which is pure).
async function fetchModules(): Promise<HabitatModule[]> {
  const { modules } = await apiGet<{ modules: HabitatModule[] }>("/modules");
  return modules;
}

async function fetchModule(id: string): Promise<HabitatModule> {
  const { module } = await apiGet<{ module: HabitatModule }>(
    `/modules/${encodeURIComponent(id)}`,
  );
  return module;
}

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
        const modules = await fetchModules();

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
        const modules = await fetchModules();

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
        const module = await fetchModule(moduleId);

        printModuleDetails(module);
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
        const { module } = await apiPost<{ module: HabitatModule }>(
          "/modules",
          {
            blueprintId: options.blueprintId,
            displayName: options.displayName,
          },
        );

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

          const { module } = await apiPatch<{ module: HabitatModule }>(
            `/modules/${encodeURIComponent(moduleId)}`,
            {
              displayName: options.displayName,
              connectedTo: options.connectedTo,
              status: options.status,
              condition:
                options.condition === undefined
                  ? undefined
                  : parseCondition(options.condition),
            },
          );

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

        const { module } = await apiPatch<{ module: HabitatModule }>(
          `/modules/${encodeURIComponent(moduleId)}`,
          { status },
        );

        console.log(
          `Set ${module.id} status to '${status}' (power draw ${formatNumber(moduleDrawKw(module))} kW).`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });

  // (delete stays a simple, id-based operation.)
  moduleCommand
    .command("delete")
    .description("Delete a local Habitat module.")
    .argument("<module-id>", "module identifier")
    .action(async (moduleId: string) => {
      try {
        const { module } = await apiDelete<{ module: HabitatModule }>(
          `/modules/${encodeURIComponent(moduleId)}`,
        );

        console.log(`Deleted module '${module.displayName}' (${module.id}).`);
      } catch (error) {
        reportError(program, error);
      }
    });
}

// Render one module as a readable summary. A construction job (stored on the
// facility's runtime attributes) is surfaced as its own block so a beginner can
// see the build progress without reading raw JSON; the remaining attributes are
// still printed for completeness.
function printModuleDetails(module: HabitatModule): void {
  const job = readConstructionJob(module);
  const status =
    typeof module.runtimeAttributes.status === "string"
      ? module.runtimeAttributes.status
      : "unknown";

  console.log(`Module:       ${module.id}`);
  console.log(`Blueprint:    ${module.blueprintId}`);
  console.log(`Display name: ${module.displayName}`);
  console.log(`Status:       ${status}`);
  console.log(`Power draw:   ${formatNumber(moduleDrawKw(module))} kW (at current status)`);
  console.log(
    `Capabilities: ${module.capabilities.length > 0 ? module.capabilities.join(", ") : "none"}`,
  );

  if (job !== null) {
    printConstructionJob(job);
  }

  const attributes = attributesWithoutJob(module);

  console.log("");
  console.log("Runtime attributes:");
  console.log(indent(JSON.stringify(attributes, null, 2)));
}

function printConstructionJob(job: ConstructionJob): void {
  const done = job.buildTicks - job.remainingTicks;

  console.log("");
  console.log("Active construction job:");
  console.log(`  Building:  ${job.outputModuleType} -> ${job.outputModuleId}`);
  console.log(`  Blueprint: ${job.blueprintId}`);
  console.log(
    `  Progress:  ${done} / ${job.buildTicks} ticks done, ${job.remainingTicks} remaining`,
  );
}

function attributesWithoutJob(
  module: HabitatModule,
): Record<string, unknown> {
  const { constructionJob: _constructionJob, ...rest } =
    module.runtimeAttributes as Record<string, unknown>;

  return rest;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
