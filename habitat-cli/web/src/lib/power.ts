import type { HabitatModule, TickSummary } from "../api/types";

// Display-side aggregation of data the API already returns. The solar charging
// formula itself lives server-side (src/tick.ts); nothing here re-derives it.

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function moduleStatus(module: HabitatModule): string {
  const status = module.runtimeAttributes.status;
  return typeof status === "string" ? status : "unknown";
}

// Mirrors the lookup the server does: a module draws the power published for
// its current status; absent statuses draw nothing.
export function moduleDrawKw(module: HabitatModule): number {
  const map = module.runtimeAttributes.powerDrawKw;
  if (map === null || typeof map !== "object") return 0;
  return num((map as Record<string, unknown>)[moduleStatus(module)]);
}

export function totalDrawKw(modules: HabitatModule[]): number {
  return modules.reduce((total, m) => total + moduleDrawKw(m), 0);
}

export type BatteryTotals = {
  energyKwh: number;
  capacityKwh: number;
  hasBattery: boolean;
};

export function batteryTotals(modules: HabitatModule[]): BatteryTotals {
  let energyKwh = 0;
  let capacityKwh = 0;
  let hasBattery = false;
  for (const m of modules) {
    const capacity = num(m.runtimeAttributes.energyStorageKwh);
    if (capacity <= 0) continue;
    hasBattery = true;
    capacityKwh += capacity;
    energyKwh += num(m.runtimeAttributes.currentEnergyKwh);
  }
  return { energyKwh, capacityKwh, hasBattery };
}

export function ratedSolarKw(modules: HabitatModule[]): number {
  return modules.reduce(
    (total, m) => total + num(m.runtimeAttributes.powerGenerationKw),
    0,
  );
}

// Average charging power over the last tick run. 1 tick = 1 simulated second,
// so kWh * 3600 / ticks is a unit conversion, not a simulation rule.
export function solarAvgKw(summary: TickSummary): number {
  if (summary.ticks <= 0) return 0;
  return (summary.solarGeneratedKwh * 3600) / summary.ticks;
}

export function formatSimTime(ticks: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(ticks / 3600);
  const mins = Math.floor((ticks % 3600) / 60);
  const secs = ticks % 60;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function formatKw(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Parses the custom tick input: accepts positive whole numbers only.
export function parseTickCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  return count;
}
