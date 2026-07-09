import type { Command } from "commander";
import { fetchSolarIrradiance } from "../kepler";
import { formatNumber } from "../format";
import { reportError } from "../cli";

// A clear-day reading is 900 W/m^2; solar charging scales against that baseline,
// so showing the percentage helps a beginner see how strong the sunlight is.
const CLEAR_DAY_W_PER_M2 = 900;

export function registerSolarCommands(program: Command): void {
  const solarCommand = program
    .command("solar")
    .description("Read the planet's current sunlight from Kepler.");

  solarCommand
    .command("status")
    .description("Show the current solar irradiance and sky condition.")
    .action(async () => {
      try {
        const irradiance = await fetchSolarIrradiance();
        const percentOfClearDay = Math.round(
          (irradiance.wPerM2 / CLEAR_DAY_W_PER_M2) * 100,
        );

        console.log(
          `Sunlight: ${formatNumber(irradiance.wPerM2)} W/m^2 (${percentOfClearDay}% of a clear day)`,
        );
        console.log(`Sky condition: ${irradiance.condition}`);

        if (irradiance.wPerM2 <= 0) {
          console.log(
            "No usable sunlight right now, so online solar panels cannot charge the battery.",
          );
        } else {
          console.log(
            "Online solar panels can charge an online battery while sunlight lasts.",
          );
        }
      } catch (error) {
        reportError(program, error);
      }
    });
}
