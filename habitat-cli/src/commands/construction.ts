import type { Command } from "commander";
import {
  formatResourceMap,
  type ActiveConstruction,
  type ConstructionEvaluation,
  type ConstructionJob,
  type StartConstructionResult,
} from "../construction";
import { apiDelete, apiGet, apiPost } from "../api-client";
import { reportError } from "../cli";

export function registerConstructionCommands(program: Command): void {
  const constructionCommand = program
    .command("construction")
    .description("Inspect and manage active construction jobs.");

  constructionCommand
    .command("status")
    .description("Show active construction jobs and remaining build time.")
    .action(async () => {
      try {
        const { active } = await apiGet<{ active: ActiveConstruction[] }>(
          "/construction",
        );

        if (active.length === 0) {
          console.log("No active construction jobs.");
          return;
        }

        console.log(
          `Active construction jobs: ${active.length}`,
        );

        for (const { facilityId, facilityName, job } of active) {
          const done = job.buildTicks - job.remainingTicks;
          console.log("");
          console.log(`  ${job.outputModuleType} -> ${job.outputModuleId}`);
          console.log(`    facility:  ${facilityName} (${facilityId})`);
          console.log(`    blueprint: ${job.blueprintId}`);
          console.log(
            `    progress:  ${done} / ${job.buildTicks} ticks done, ${job.remainingTicks} remaining`,
          );
        }
      } catch (error) {
        reportError(program, error);
      }
    });

  constructionCommand
    .command("cancel")
    .description(
      "Cancel an active construction job on a facility (materials are not refunded).",
    )
    .argument("<facility-id>", "facility module id, e.g. workshop-fabricator-1")
    .action(async (facilityId: string) => {
      try {
        const { job } = await apiDelete<{ job: ConstructionJob }>(
          `/construction/${encodeURIComponent(facilityId)}`,
        );

        console.log(`Construction canceled on ${facilityId}.`);
        console.log(
          `Dropped job: ${job.blueprintId} -> ${job.outputModuleId} (${job.remainingTicks} of ${job.buildTicks} ticks were still remaining).`,
        );
        console.log(`Facility ${facilityId} is available again.`);
        console.log(
          `Materials were NOT refunded: ${formatResourceMap(job.spent)} stay spent.`,
        );
        console.log("The output module was not created.");
      } catch (error) {
        reportError(program, error);
      }
    });

  program
    .command("construct")
    .description(
      "Start construction of a module from a Kepler blueprint using local materials.",
    )
    .argument("<blueprint-id>", "blueprint identifier, e.g. small-solar-array")
    .option(
      "--dry-run",
      "check whether construction can start without changing any local state",
    )
    .action(async (blueprintId: string, options: { dryRun?: boolean }) => {
      try {
        if (options.dryRun) {
          const { evaluation } = await apiPost<{
            evaluation: ConstructionEvaluation;
          }>("/construction", { blueprintId, dryRun: true });
          printDryRun(evaluation);
          return;
        }

        const { facilityId, job } = await apiPost<StartConstructionResult>(
          "/construction",
          { blueprintId },
        );

        console.log(`Construction started: ${job.blueprintId}`);
        console.log(`Facility:      ${facilityId} (now active)`);
        console.log(`Output module: ${job.outputModuleId} (${job.outputModuleType})`);
        console.log(`Build time:    ${job.remainingTicks} / ${job.buildTicks} ticks remaining`);
        console.log(`Spent:         ${formatResourceMap(job.spent)}`);
        console.log("");
        console.log(
          "The module is not built yet. Advance it with 'habitat tick <count>' and watch 'habitat construction status'.",
        );
      } catch (error) {
        reportError(program, error);
      }
    });
}

function printDryRun(evaluation: ConstructionEvaluation): void {
  console.log(`Construction dry run: ${evaluation.blueprintId}`);
  console.log(`Blueprint:    ${evaluation.displayName}`);
  console.log(`Would create: module '${evaluation.outputModuleType}'`);
  console.log(`Build time:   ${evaluation.buildTicks} ticks`);
  console.log(
    `Would spend:  ${formatResourceMap(evaluation.requiredResources)}`,
  );
  console.log("");
  console.log("Readiness checks:");

  for (const check of evaluation.checks) {
    const mark = check.ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${check.label} — ${check.detail}`);
  }

  console.log("");

  if (evaluation.canStart) {
    console.log("Result: construction CAN start. No local state was changed.");
  } else {
    console.log(
      "Result: construction CANNOT start yet. Resolve the FAIL checks above. No local state was changed.",
    );
  }
}
