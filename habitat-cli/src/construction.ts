import {
  allocateModuleId,
  getBlueprintById,
  listHabitatModules,
  refreshBlueprintCatalog,
  writeHabitatModules,
  type HabitatModule,
} from "./modules";
import {
  findInventoryShortfalls,
  spendInventory,
  type Shortfall,
} from "./inventory";
import type { ProductionBlueprint } from "./kepler";

// Construction reads a blueprint from the Kepler catalog (cached locally) but
// writes only local Habitat state: the job lives on the facility module and the
// finished module is created locally when the job completes. Nothing here calls
// back to Kepler to mutate remote state.

// The active job is stored on the construction facility's runtimeAttributes so a
// facility is "busy" exactly when it carries a job. This keeps job storage next
// to the module that owns it instead of a separate top-level file.
export const CONSTRUCTION_JOB_KEY = "constructionJob";

export type ConstructionJob = {
  blueprintId: string;
  outputModuleId: string;
  outputModuleType: string;
  buildTicks: number;
  remainingTicks: number;
  productionPowerCostKw: number;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
  spent: Record<string, number>;
};

export type ConstructionCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type ConstructionEvaluation = {
  blueprintId: string;
  displayName: string;
  outputModuleType: string;
  buildTicks: number;
  requiredResources: Record<string, number>;
  productionPowerCostKw: number;
  facilityModuleType: string | null;
  facilityId: string | null;
  checks: ConstructionCheck[];
  canStart: boolean;
};

// Resolve a blueprint the same way `module create` does: prefer the local cache,
// and refresh from Kepler once if it is missing.
export async function resolveConstructionBlueprint(
  blueprintId: string,
  baseUrl?: string,
): Promise<ProductionBlueprint> {
  const existing = await getBlueprintById(blueprintId);

  if (existing !== null) {
    return existing;
  }

  if (baseUrl === undefined) {
    throw new Error(
      `Blueprint '${blueprintId}' is not cached locally. Register the habitat or refresh the blueprint catalog first.`,
    );
  }

  await refreshBlueprintCatalog(baseUrl);
  const refreshed = await getBlueprintById(blueprintId);

  if (refreshed === null) {
    throw new Error(
      `Blueprint '${blueprintId}' was not found in the published catalog.`,
    );
  }

  return refreshed;
}

export async function evaluateConstruction(
  blueprintId: string,
  baseUrl?: string,
): Promise<ConstructionEvaluation> {
  const blueprint = await resolveConstructionBlueprint(blueprintId, baseUrl);
  const modules = await listHabitatModules();

  const requiredResources = toResourceMap(blueprint.inputs);
  const outputModuleType = readOutputModuleType(blueprint);
  const facilityType = readFacilityModuleType(blueprint);
  const productionPowerCostKw = readProductionPowerCost(blueprint);

  const facility =
    facilityType === null ? null : findFacility(modules, facilityType);
  const supplyCache = findSupplyCache(modules);
  const shortfalls = await findInventoryShortfalls(requiredResources);
  const usableEnergyKwh = usableBatteryEnergyKwh(modules);

  const checks: ConstructionCheck[] = [];

  checks.push({
    label: "Blueprint is published",
    ok: blueprint.status === "published",
    detail:
      blueprint.status === "published"
        ? `status: ${blueprint.status}`
        : `status: ${blueprint.status} (not buildable)`,
  });

  checks.push({
    label: "Required facility exists",
    ok: facility !== null,
    detail:
      facility !== null
        ? `${facility.id} (${facilityType})`
        : `no '${facilityType ?? "unknown"}' module in habitat`,
  });

  const facilityBusy = facility !== null && hasConstructionJob(facility);
  const facilityOnline =
    facility !== null && readStatus(facility) === "online";

  checks.push({
    label: "Facility is online and available",
    ok: facility !== null && facilityOnline && !facilityBusy,
    detail:
      facility === null
        ? "no facility"
        : facilityBusy
          ? `${facility.id} is busy with another construction job`
          : `${facility.id} status: ${readStatus(facility)}`,
  });

  checks.push({
    label: "Supply cache is online",
    ok: supplyCache !== null && readStatus(supplyCache) === "online",
    detail:
      supplyCache === null
        ? "no storage module (supply cache) in habitat"
        : `${supplyCache.id} status: ${readStatus(supplyCache)}`,
  });

  const missingPrereqs = findMissingPrerequisites(modules, blueprint);
  checks.push({
    label: "Prerequisites are met",
    ok: missingPrereqs.length === 0,
    detail:
      missingPrereqs.length === 0
        ? blueprint.prerequisites && blueprint.prerequisites.length > 0
          ? `all present: ${blueprint.prerequisites.join(", ")}`
          : "none required"
        : `missing: ${missingPrereqs.join(", ")}`,
  });

  checks.push({
    label: "Inventory has enough materials",
    ok: shortfalls.length === 0,
    detail:
      shortfalls.length === 0
        ? formatResourceMap(requiredResources)
        : formatShortfalls(shortfalls),
  });

  checks.push({
    label: "Habitat has usable power",
    ok: usableEnergyKwh > 0,
    detail:
      usableEnergyKwh > 0
        ? `${round(usableEnergyKwh)} kWh available above battery reserve`
        : "no usable battery energy above reserve",
  });

  const canStart = checks.every((check) => check.ok);

  return {
    blueprintId: blueprint.blueprintId,
    displayName: blueprint.displayName,
    outputModuleType,
    buildTicks: blueprint.buildTicks,
    requiredResources,
    productionPowerCostKw,
    facilityModuleType: facilityType,
    facilityId: facility?.id ?? null,
    checks,
    canStart,
  };
}

export type StartConstructionResult = {
  facilityId: string;
  job: ConstructionJob;
};

// Start a real construction job. Re-runs the readiness evaluation and refuses to
// change any state unless every check passes, then spends materials and attaches
// the job to the facility. The output module is intentionally NOT created here;
// it comes online later when ticks reduce remainingTicks to zero.
export async function startConstruction(
  blueprintId: string,
  baseUrl?: string,
): Promise<StartConstructionResult> {
  const evaluation = await evaluateConstruction(blueprintId, baseUrl);

  if (!evaluation.canStart) {
    const failed = evaluation.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.label} — ${check.detail}`);

    throw new Error(
      `Construction cannot start:\n  - ${failed.join("\n  - ")}`,
    );
  }

  const blueprint = await resolveConstructionBlueprint(blueprintId, baseUrl);
  const modules = await listHabitatModules();

  // facilityModuleType is guaranteed non-null once the facility check passes.
  const facility = findFacility(modules, evaluation.facilityModuleType as string);

  if (facility === null) {
    throw new Error("Required construction facility disappeared unexpectedly.");
  }

  const outputModuleId = allocateModuleId(modules, evaluation.outputModuleType);

  const job: ConstructionJob = {
    blueprintId: blueprint.blueprintId,
    outputModuleId,
    outputModuleType: evaluation.outputModuleType,
    buildTicks: blueprint.buildTicks,
    remainingTicks: blueprint.buildTicks,
    productionPowerCostKw: evaluation.productionPowerCostKw,
    runtimeAttributes: cloneRuntimeAttributes(blueprint.runtimeAttributes),
    capabilities: [...blueprint.capabilities],
    spent: { ...evaluation.requiredResources },
  };

  // Spend materials first; if this throws the module state is left untouched.
  await spendInventory(evaluation.requiredResources);

  facility.runtimeAttributes[CONSTRUCTION_JOB_KEY] = job;
  facility.runtimeAttributes.status = "active";

  await writeHabitatModules(modules);

  return { facilityId: facility.id, job };
}

function cloneRuntimeAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(attributes)) as Record<string, unknown>;
}

export type ConstructionCompletion = {
  facilityId: string;
  moduleId: string;
  moduleType: string;
};

// Advance every active job by one *powered* tick, mutating `modules` in place.
// When a job's remaining ticks reach zero the output module is appended to the
// habitat, the job is cleared from the facility, and the facility returns to
// "online" so it is available again. An unpowered tick advances nothing, which
// is how a depleted battery stalls construction.
export function advanceConstructionTick(
  modules: HabitatModule[],
  powered: boolean,
): ConstructionCompletion[] {
  if (!powered) {
    return [];
  }

  const completions: ConstructionCompletion[] = [];
  const created: HabitatModule[] = [];

  for (const module of modules) {
    const job = readConstructionJob(module);

    if (job === null) {
      continue;
    }

    job.remainingTicks -= 1;

    if (job.remainingTicks <= 0) {
      created.push(buildOutputModule(job));
      delete module.runtimeAttributes[CONSTRUCTION_JOB_KEY];
      module.runtimeAttributes.status = "online";

      completions.push({
        facilityId: module.id,
        moduleId: job.outputModuleId,
        moduleType: job.outputModuleType,
      });
    }
  }

  // Append completed modules after the loop so they are not themselves advanced.
  modules.push(...created);

  return completions;
}

function buildOutputModule(job: ConstructionJob): HabitatModule {
  return {
    id: job.outputModuleId,
    blueprintId: job.outputModuleType,
    displayName: titleCaseModuleType(job.outputModuleType),
    connectedTo: [],
    runtimeAttributes: job.runtimeAttributes,
    capabilities: job.capabilities,
  };
}

function titleCaseModuleType(moduleType: string): string {
  return moduleType
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ActiveConstruction = {
  facilityId: string;
  facilityName: string;
  job: ConstructionJob;
};

// List every facility currently carrying a construction job, newest state read
// fresh from disk. Used by `construction status` and `construction cancel`.
export async function listActiveConstructions(): Promise<ActiveConstruction[]> {
  const modules = await listHabitatModules();
  const active: ActiveConstruction[] = [];

  for (const module of modules) {
    const job = readConstructionJob(module);

    if (job !== null) {
      active.push({
        facilityId: module.id,
        facilityName: module.displayName,
        job,
      });
    }
  }

  return active;
}

// Cancel an active job: clear it from the facility and make the facility
// available again. The output module is NOT created and spent materials are NOT
// refunded — cancellation forfeits whatever was already invested.
export async function cancelConstruction(
  facilityId: string,
): Promise<{ facilityId: string; job: ConstructionJob }> {
  const modules = await listHabitatModules();
  const facility = modules.find((module) => module.id === facilityId);

  if (facility === undefined) {
    throw new Error(`Facility '${facilityId}' was not found.`);
  }

  const job = readConstructionJob(facility);

  if (job === null) {
    throw new Error(
      `Facility '${facilityId}' has no active construction job to cancel.`,
    );
  }

  delete facility.runtimeAttributes[CONSTRUCTION_JOB_KEY];
  facility.runtimeAttributes.status = "online";

  await writeHabitatModules(modules);

  return { facilityId, job };
}

export function findFacility(
  modules: HabitatModule[],
  facilityModuleType: string,
): HabitatModule | null {
  return (
    modules.find((module) => module.blueprintId === facilityModuleType) ?? null
  );
}

// A supply cache is any module that advertises the "storage" capability, which
// matches the supply-cache starter without hardcoding a specific id.
export function findSupplyCache(
  modules: HabitatModule[],
): HabitatModule | null {
  return (
    modules.find((module) => module.capabilities.includes("storage")) ?? null
  );
}

export function hasConstructionJob(module: HabitatModule): boolean {
  const job = module.runtimeAttributes[CONSTRUCTION_JOB_KEY];

  return typeof job === "object" && job !== null && !Array.isArray(job);
}

export function readConstructionJob(
  module: HabitatModule,
): ConstructionJob | null {
  if (!hasConstructionJob(module)) {
    return null;
  }

  return module.runtimeAttributes[CONSTRUCTION_JOB_KEY] as ConstructionJob;
}

export function usableBatteryEnergyKwh(modules: HabitatModule[]): number {
  let usable = 0;

  for (const module of modules) {
    const attributes = module.runtimeAttributes;

    if (
      typeof attributes.currentEnergyKwh === "number" &&
      typeof attributes.energyStorageKwh === "number"
    ) {
      const reserve =
        typeof attributes.reserveKwh === "number" ? attributes.reserveKwh : 0;

      usable += Math.max(0, attributes.currentEnergyKwh - reserve);
    }
  }

  return usable;
}

function findMissingPrerequisites(
  modules: HabitatModule[],
  blueprint: ProductionBlueprint,
): string[] {
  const prerequisites = blueprint.prerequisites ?? [];

  return prerequisites.filter((prerequisite) => {
    return !modules.some(
      (module) =>
        module.blueprintId === prerequisite ||
        module.capabilities.includes(prerequisite),
    );
  });
}

function readStatus(module: HabitatModule): string {
  const status = module.runtimeAttributes.status;

  return typeof status === "string" ? status : "unknown";
}

function readOutputModuleType(blueprint: ProductionBlueprint): string {
  const moduleType = blueprint.output?.moduleType;

  return typeof moduleType === "string" ? moduleType : blueprint.blueprintId;
}

function readFacilityModuleType(blueprint: ProductionBlueprint): string | null {
  const moduleType = blueprint.requiredFacility?.moduleType;

  return typeof moduleType === "string" ? moduleType : null;
}

function readProductionPowerCost(blueprint: ProductionBlueprint): number {
  const power = blueprint.productionCost?.power;

  return typeof power === "number" && Number.isFinite(power) ? power : 0;
}

export function toResourceMap(
  inputs: Record<string, unknown>,
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const [resource, value] of Object.entries(inputs)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      map[resource] = value;
    }
  }

  return map;
}

export function formatResourceMap(map: Record<string, number>): string {
  const entries = Object.entries(map);

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([resource, amount]) => `${resource} x${amount}`).join(", ");
}

function formatShortfalls(shortfalls: Shortfall[]): string {
  return shortfalls
    .map(
      (shortfall) =>
        `${shortfall.resource} (need ${shortfall.required}, have ${shortfall.available})`,
    )
    .join(", ");
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
