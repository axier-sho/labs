import {
  type HabitatModule,
  listHabitatModules,
  writeHabitatModules,
} from "./modules";
import {
  advanceConstructionTick,
  readConstructionJob,
  usableBatteryEnergyKwh,
  type ConstructionCompletion,
} from "./construction";
import { fetchSolarIrradiance, type SolarIrradiance } from "./kepler";

// The Kepler docs fix the time/power model: one tick is one simulated second and
// 3600 ticks make one simulated hour, so instantaneous power (kW) converts to
// energy moved in a single tick by dividing by 3600.
//   https://planet.turingguild.com/docs
const TICKS_PER_HOUR = 3600;

// Solar model (kept deliberately simple for the lab): irradiance is measured
// against a 900 W/m^2 clear day, and a panel converts only half of its rated
// output into stored charge. Lower irradiance => less charge; zero => none.
const CLEAR_DAY_W_PER_M2 = 900;
const SOLAR_EFFICIENCY = 0.5;

// The Kepler planet server owns the sunlight reading; the CLI injects it here so
// tick tests can run offline. A null result means "no usable reading" and simply
// disables solar charging for the run.
export type SolarIrradianceFetcher = () => Promise<SolarIrradiance | null>;

export type TickOptions = {
  fetchIrradiance?: SolarIrradianceFetcher;
};

export type TickSummary = {
  ticks: number;
  powerDrawKw: number;
  energyConsumedKwh: number;
  batteryEnergyKwh: number;
  batteryCapacityKwh: number;
  hasBattery: boolean;
  completions: ConstructionCompletion[];
  constructionStalled: boolean;
  // Solar charging outcome for the whole run.
  solarGeneratedKwh: number;
  solarWPerM2: number | null;
  solarCondition: string | null;
  // Set when no charging happened; explains why (offline panel, full battery...).
  solarSkipReason: string | null;
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

function isOnline(module: HabitatModule): boolean {
  return module.runtimeAttributes.status === "online";
}

// A solar module is any module that publishes a positive rated generation value;
// this matches the small-solar-array (powerGenerationKw) without hardcoding ids.
function solarGenerationKw(module: HabitatModule): number {
  const rated = module.runtimeAttributes.powerGenerationKw;

  return typeof rated === "number" && Number.isFinite(rated) && rated > 0
    ? rated
    : 0;
}

function isSolar(module: HabitatModule): boolean {
  return solarGenerationKw(module) > 0;
}

async function safeFetchIrradiance(): Promise<SolarIrradiance | null> {
  try {
    return await fetchSolarIrradiance();
  } catch {
    // Kepler unreachable or returned no usable reading: skip solar charging but
    // let the rest of the tick (draw, construction) run normally.
    return null;
  }
}

export async function runPowerTicks(
  count: number,
  options: TickOptions = {},
): Promise<TickSummary> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Tick count must be a positive integer.");
  }

  const modules = await listHabitatModules();

  const batteries = modules.filter(isBattery);
  const batteryCapacityKwh = batteries.reduce(
    (total, battery) => total + (battery.runtimeAttributes.energyStorageKwh as number),
    0,
  );

  // Solar charging needs an online panel AND an online battery to receive the
  // charge; only then is it worth querying Kepler for the sunlight reading.
  const onlineSolar = modules.filter(
    (module) => isSolar(module) && isOnline(module),
  );
  const onlineBatteries = batteries.filter(isOnline);
  const ratedSolarKw = onlineSolar.reduce(
    (total, module) => total + solarGenerationKw(module),
    0,
  );

  const fetchIrradiance = options.fetchIrradiance ?? safeFetchIrradiance;
  const irradiance =
    ratedSolarKw > 0 && onlineBatteries.length > 0
      ? await fetchIrradiance()
      : null;

  // generatedKwhPerTick = ratedKw * (wPerM2 / 900) * 0.5 / 3600
  const usableSunlight =
    irradiance !== null && irradiance.wPerM2 > 0 ? irradiance.wPerM2 : 0;
  const generatedKwhPerTick =
    (ratedSolarKw * (usableSunlight / CLEAR_DAY_W_PER_M2) * SOLAR_EFFICIENCY) /
    TICKS_PER_HOUR;

  let energyConsumedKwh = 0;
  let solarGeneratedKwh = 0;
  let powerDrawKw = totalDrawKw(modules);
  let constructionStalled = false;
  const completions: ConstructionCompletion[] = [];

  // Draw is recomputed each tick because a completing construction job frees its
  // facility (active -> online), which lowers demand for the remaining ticks.
  for (let tick = 0; tick < count; tick += 1) {
    powerDrawKw = totalDrawKw(modules);
    const energyPerTickKwh = powerDrawKw / TICKS_PER_HOUR;

    // A tick can only advance construction if the habitat has usable power at
    // the start of the tick; a depleted battery stalls the build.
    const powered = usableBatteryEnergyKwh(modules) > 0;

    if (!powered && hasActiveConstruction(modules)) {
      constructionStalled = true;
    }

    energyConsumedKwh += drainBatteries(batteries, energyPerTickKwh);
    // Charge after the draw so this tick's sunlight can top the battery back up,
    // never exceeding each battery's maximum capacity.
    solarGeneratedKwh += chargeBatteries(onlineBatteries, generatedKwhPerTick);
    completions.push(...advanceConstructionTick(modules, powered));
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
    completions,
    constructionStalled,
    solarGeneratedKwh,
    solarWPerM2: irradiance?.wPerM2 ?? null,
    solarCondition: irradiance?.condition ?? null,
    solarSkipReason: describeSolarSkip({
      modules,
      ratedSolarKw,
      onlineBatteryCount: onlineBatteries.length,
      irradiance,
      solarGeneratedKwh,
    }),
  };
}

// Explain why no charge was stored this run, or null if charging did happen.
// Ordered from "hardest to fix" (no panel) to "already at capacity".
function describeSolarSkip(input: {
  modules: HabitatModule[];
  ratedSolarKw: number;
  onlineBatteryCount: number;
  irradiance: SolarIrradiance | null;
  solarGeneratedKwh: number;
}): string | null {
  if (input.solarGeneratedKwh > 0) {
    return null;
  }

  if (!input.modules.some(isSolar)) {
    return "no solar panel in the habitat";
  }

  if (input.ratedSolarKw <= 0) {
    return "solar panel is offline";
  }

  if (input.onlineBatteryCount === 0) {
    return "no online battery to receive charge";
  }

  if (input.irradiance === null) {
    return "Kepler solar irradiance was unavailable";
  }

  if (input.irradiance.wPerM2 <= 0) {
    return `no usable sunlight (${input.irradiance.wPerM2} W/m^2, ${input.irradiance.condition})`;
  }

  return "online batteries are already full";
}

function hasActiveConstruction(modules: HabitatModule[]): boolean {
  return modules.some((module) => readConstructionJob(module) !== null);
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

// Add up to `energyKwh` to the batteries in order, capping each at its maximum
// stored energy. Returns the energy actually stored this tick.
function chargeBatteries(
  batteries: HabitatModule[],
  energyKwh: number,
): number {
  let remaining = energyKwh;
  let added = 0;

  for (const battery of batteries) {
    if (remaining <= 0) {
      break;
    }

    const current = battery.runtimeAttributes.currentEnergyKwh as number;
    const capacity = battery.runtimeAttributes.energyStorageKwh as number;
    const room = Math.max(0, capacity - current);
    const put = Math.min(room, remaining);

    battery.runtimeAttributes.currentEnergyKwh = current + put;
    remaining -= put;
    added += put;
  }

  return added;
}
