import type { Command } from "commander";
import type { TickSummary } from "../tick";
import { apiPost } from "../api-client";
import { formatNumber } from "../format";
import { parseTickCount, reportError } from "../cli";

export function registerTickCommands(program: Command): void {
  program
    .command("tick")
    .description(
      "Advance the habitat simulation by draining battery power (1 tick = 1 simulated second).",
    )
    .argument("[count]", "number of ticks to advance", "1")
    .action(async (countArg: string) => {
      try {
        const count = parseTickCount(countArg);
        const { summary } = await apiPost<{ summary: TickSummary }>("/ticks", {
          count,
        });

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

        if (summary.solarGeneratedKwh > 0) {
          const sky =
            summary.solarWPerM2 !== null
              ? ` (${formatNumber(summary.solarWPerM2)} W/m^2${summary.solarCondition ? `, ${summary.solarCondition}` : ""})`
              : "";
          console.log(
            `Solar generated: ${formatNumber(summary.solarGeneratedKwh)} kWh${sky}`,
          );
        } else if (summary.solarSkipReason !== null) {
          console.log(`Solar generated: none — ${summary.solarSkipReason}.`);
        }

        if (summary.batteryEnergyKwh === 0) {
          console.log("Battery depleted.");
        }

        if (summary.constructionStalled) {
          console.log(
            "Construction stalled: no usable battery power. Jobs resume once the battery recovers above its reserve.",
          );
        }

        for (const completion of summary.completions) {
          console.log(
            `Construction complete: ${completion.moduleId} (${completion.moduleType}) is online. ${completion.facilityId} is available again.`,
          );
        }
      } catch (error) {
        reportError(program, error);
      }
    });
}
