import type { Command } from "commander";
import type { Human } from "../humans";
import { apiGet, apiPatch } from "../api-client";
import { renderTable } from "../format";
import { reportError } from "../cli";

export function registerHumanCommands(program: Command): void {
  const humanCommand = program
    .command("human")
    .description("Manage the humans living in this habitat.");

  humanCommand
    .command("list")
    .description("List the habitat's humans and the module each one is in.")
    .option("--json", "print the complete JSON response")
    .action(async (options: { json?: boolean }) => {
      try {
        const { humans } = await apiGet<{ humans: Human[] }>("/humans");

        if (options.json === true) {
          console.log(JSON.stringify(humans, null, 2));
          return;
        }

        if (humans.length === 0) {
          console.log(
            "This habitat has no humans. They arrive with registration — run 'habitat status' to check it registered.",
          );
          return;
        }

        const rows = humans.map((human) => [
          human.id,
          human.displayName,
          human.locationModuleId,
        ]);

        console.log(renderTable(["Human", "Name", "Location"], rows));
      } catch (error) {
        reportError(program, error);
      }
    });

  humanCommand
    .command("move")
    .description("Move a human to another module in this habitat.")
    .argument("<human-id>", "id of the human to move")
    .argument("<module-id>", "id of the destination module")
    .action(async (humanId: string, moduleId: string) => {
      try {
        const { human } = await apiPatch<{ human: Human }>(
          `/humans/${encodeURIComponent(humanId)}`,
          { locationModuleId: moduleId },
        );

        console.log(
          `Moved ${human.displayName} (${human.id}) to ${human.locationModuleId}.`,
        );
      } catch (error) {
        reportError(program, error);
      }
    });
}
