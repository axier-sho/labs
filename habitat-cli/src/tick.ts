import {
  type HabitatModule,
  listHabitatModules,
  writeHabitatModules,
} from "./modules";

// The Kepler docs fix the time/power model: one tick is one simulated second and
// 3600 ticks make one simulated hour, so instantaneous power (kW) converts to
// energy moved in a single tick by dividing by 3600.
//   https://planet.turingguild.com/docs
const TICKS_PER_HOUR = 3600;

export type TickSummary = {
  ticks: number;
  powerDrawKw: number;
  energyConsumedKwh: number;
  batteryEnergyKwh: number;
  batteryCapacityKwh: number;
  hasBattery: boolean;
};

// A module draws the power published for its current status. Statuses that are
// not present in the powerDrawKw map (e.g. "maintenance") draw nothing.
export function moduleDrawKw(module: HabitatModule): number {
  const attributes = module.runtimeAttributes;
  const powerDrawKw = attributes.powerDrawKw;

  if (
    typeof powerDrawKw !== "object" ||
    powerDrawKw === null ||
    Array.isArray(powerDrawKw)
  ) {
    return 0;
  }

  const status = attributes.status;

  if (typeof status !== "string") {
    return 0;
  }

  const draw = (powerDrawKw as Record<string, unknown>)[status];

  return typeof draw === "number" && Number.isFinite(draw) ? draw : 0;
}

export function totalDrawKw(modules: HabitatModule[]): number {
  return modules.reduce((total, module) => total + moduleDrawKw(module), 0);
}

// A battery is any module that publishes both a current and a maximum stored
// energy value; this matches the basic-battery starter without hardcoding ids.
function isBattery(module: HabitatModule): boolean {
  const attributes = module.runtimeAttributes;

  return (
    typeof attributes.currentEnergyKwh === "number" &&
    typeof attributes.energyStorageKwh === "number"
  );
}

export async function runPowerTicks(count: number): Promise<TickSummary> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Tick count must be a positive integer.");
  }

  const modules = await listHabitatModules();
  const powerDrawKw = totalDrawKw(modules);
  const energyPerTickKwh = powerDrawKw / TICKS_PER_HOUR;

  const batteries = modules.filter(isBattery);
  const batteryCapacityKwh = batteries.reduce(
    (total, battery) => total + (battery.runtimeAttributes.energyStorageKwh as number),
    0,
  );

  let energyConsumedKwh = 0;

  // Demand is constant across a power-only tick, so each tick removes the same
  // energy; the loop keeps the per-tick clamp explicit for future extension.
  for (let tick = 0; tick < count; tick += 1) {
    energyConsumedKwh += drainBatteries(batteries, energyPerTickKwh);
  }

  const batteryEnergyKwh = batteries.reduce(
    (total, battery) => total + (battery.runtimeAttributes.currentEnergyKwh as number),
    0,
  );

  await writeHabitatModules(modules);

  return {
    ticks: count,
    powerDrawKw,
    energyConsumedKwh,
    batteryEnergyKwh,
    batteryCapacityKwh,
    hasBattery: batteries.length > 0,
  };
}

// Remove up to `energyKwh` from the batteries in order, clamping each at 0.
// Returns the energy actually removed this tick.
function drainBatteries(
  batteries: HabitatModule[],
  energyKwh: number,
): number {
  let remaining = energyKwh;
  let removed = 0;

  for (const battery of batteries) {
    if (remaining <= 0) {
      break;
    }

    const available = battery.runtimeAttributes.currentEnergyKwh as number;
    const take = Math.min(available, remaining);

    battery.runtimeAttributes.currentEnergyKwh = available - take;
    remaining -= take;
    removed += take;
  }

  return removed;
}
