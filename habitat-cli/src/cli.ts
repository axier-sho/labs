import type { Command } from "commander";

// Shared CLI helpers used by the command modules under src/commands/. These are
// deliberately tiny and free of any domain behavior (that lives in kepler.ts,
// modules.ts, tick.ts, and catalog.ts).

export function reportError(program: Command, error: unknown): void {
  program.error(error instanceof Error ? error.message : String(error));
}

export function parseCondition(value: string): number {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error("Condition must be a number.");
  }

  return parsed;
}

export function parseTickCount(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Tick count must be a positive integer.");
  }

  return parsed;
}
