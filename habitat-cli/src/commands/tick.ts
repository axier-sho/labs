import type { Command } from "commander";
import { runPowerTicks } from "../tick";
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
        reportError(program, error);
      }
    });
}
