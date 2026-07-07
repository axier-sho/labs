import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  fetchBlueprintCatalog,
  type ProductionBlueprint,
  type StarterModuleInstance,
} from "./kepler";

type JsonRecord = Record<string, unknown>;

export type HabitatModule = {
  id: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: JsonRecord;
  capabilities: string[];
};

type ModuleState = {
  modules: HabitatModule[];
};

type BlueprintState = {
  catalogVersion: string | null;
  blueprints: ProductionBlueprint[];
};

type ModulePatch = {
  displayName?: string;
  connectedTo?: string[];
  runtimeAttributes?: JsonRecord;
  capabilities?: string[];
  status?: string;
  condition?: number;
};

const MODULE_STATE_FILE = "modules.json";
const BLUEPRINT_STATE_FILE = "blueprints.json";

function moduleStatePath(): string {
  return join(process.cwd(), ".habitat", MODULE_STATE_FILE);
}

function blueprintStatePath(): string {
  return join(process.cwd(), ".habitat", BLUEPRINT_STATE_FILE);
}

export async function hydrateModulesFromRegistration(input: {
  starterModules: StarterModuleInstance[];
  blueprints: ProductionBlueprint[];
}): Promise<void> {
  await writeModuleState({
    modules: hydrateStarterModules(input.starterModules),
  });
  await seedBlueprintState(input.blueprints);
}

export async function replaceBlueprintCatalog(input: {
  catalogVersion: string;
  blueprints: ProductionBlueprint[];
}): Promise<void> {
  await writeBlueprintState({
    catalogVersion: input.catalogVersion,
    blueprints: cloneBlueprints(input.blueprints),
  });
}

export async function seedBlueprintState(
  blueprints: ProductionBlueprint[],
): Promise<void> {
  const current = await readBlueprintState();
  const merged = mergeBlueprints(current.blueprints, blueprints);

  await writeBlueprintState({
    catalogVersion: current.catalogVersion,
    blueprints: merged,
  });
}

export async function listHabitatModules(): Promise<HabitatModule[]> {
  const state = await readModuleState();

  return cloneModules(state.modules);
}

export async function getHabitatModule(
  id: string,
): Promise<HabitatModule | null> {
  const state = await readModuleState();
  const module = state.modules.find((candidate) => candidate.id === id);

  return module === undefined ? null : cloneModule(module);
}

export async function getBlueprintById(
  blueprintId: string,
): Promise<ProductionBlueprint | null> {
  const state = await readBlueprintState();
  const blueprint = state.blueprints.find(
    (candidate) => candidate.blueprintId === blueprintId,
  );

  return blueprint === undefined ? null : cloneBlueprint(blueprint);
}

export async function createHabitatModule(input: {
  blueprintId: string;
  displayName?: string;
  baseUrl?: string;
}): Promise<HabitatModule> {
  const blueprint = await resolveBlueprintForCreate(
    input.blueprintId,
    input.baseUrl,
  );

  const displayName = normalizeOptionalName(
    input.displayName ?? blueprint.displayName,
    "display name",
  );
  const state = await readModuleState();

  const created: HabitatModule = {
    id: createSequentialModuleId(state.modules, blueprint.blueprintId),
    blueprintId: blueprint.blueprintId,
    displayName,
    connectedTo: [],
    runtimeAttributes: cloneJsonRecord(blueprint.runtimeAttributes),
    capabilities: [...blueprint.capabilities],
  };

  state.modules.push(created);
  await writeModuleState(state);

  return cloneModule(created);
}

export async function updateHabitatModule(
  id: string,
  patch: ModulePatch,
): Promise<HabitatModule> {
  const state = await readModuleState();
  const module = state.modules.find((candidate) => candidate.id === id);

  if (module === undefined) {
    throw new Error(`Module '${id}' was not found.`);
  }

  if (patch.displayName !== undefined) {
    module.displayName = normalizeOptionalName(
      patch.displayName,
      "display name",
    );
  }

  if (patch.connectedTo !== undefined) {
    module.connectedTo = [...patch.connectedTo];
  }

  if (patch.runtimeAttributes !== undefined) {
    module.runtimeAttributes = cloneJsonRecord(patch.runtimeAttributes);
  }

  if (patch.capabilities !== undefined) {
    module.capabilities = [...patch.capabilities];
  }

  if (patch.status !== undefined || patch.condition !== undefined) {
    module.runtimeAttributes = {
      ...module.runtimeAttributes,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
    };
  }

  await writeModuleState(state);

  return cloneModule(module);
}

export async function deleteHabitatModule(id: string): Promise<HabitatModule> {
  const state = await readModuleState();
  const index = state.modules.findIndex((candidate) => candidate.id === id);

  if (index === -1) {
    throw new Error(`Module '${id}' was not found.`);
  }

  const [removed] = state.modules.splice(index, 1);
  await writeModuleState(state);

  return cloneModule(removed);
}

export async function clearHabitatModuleState(): Promise<void> {
  await rm(moduleStatePath(), { force: true });
}

export async function clearBlueprintCatalog(): Promise<void> {
  await rm(blueprintStatePath(), { force: true });
}

export async function refreshBlueprintCatalog(baseUrl: string): Promise<void> {
  const response = await fetchBlueprintCatalog(baseUrl);

  await replaceBlueprintCatalog({
    catalogVersion: response.catalogVersion,
    blueprints: response.blueprints,
  });
}

async function resolveBlueprintForCreate(
  blueprintId: string,
  baseUrl?: string,
): Promise<ProductionBlueprint> {
  const existing = await getBlueprintById(blueprintId);

  if (existing !== null) {
    validateBuildableBlueprint(existing);
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

  validateBuildableBlueprint(refreshed);
  return refreshed;
}

function validateBuildableBlueprint(blueprint: ProductionBlueprint): void {
  if (blueprint.status !== "published") {
    throw new Error(
      `Blueprint '${blueprint.blueprintId}' is not published and cannot be created locally.`,
    );
  }

  if ((blueprint.prerequisites?.length ?? 0) > 0) {
    throw new Error(
      `Blueprint '${blueprint.blueprintId}' is not currently buildable because it has prerequisites: ${blueprint.prerequisites?.join(", ")}`,
    );
  }
}

async function readModuleState(): Promise<ModuleState> {
  const file = Bun.file(moduleStatePath());

  if (!(await file.exists())) {
    return { modules: [] };
  }

  const contents = await file.text();

  if (contents.trim() === "") {
    return { modules: [] };
  }

  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const modules = Array.isArray(parsed.modules) ? parsed.modules : [];

  return {
    modules: modules.map(readModule),
  };
}

async function writeModuleState(state: ModuleState): Promise<void> {
  await mkdir(dirname(moduleStatePath()), { recursive: true });
  await Bun.write(moduleStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

async function readBlueprintState(): Promise<BlueprintState> {
  const file = Bun.file(blueprintStatePath());

  if (!(await file.exists())) {
    return { catalogVersion: null, blueprints: [] };
  }

  const contents = await file.text();

  if (contents.trim() === "") {
    return { catalogVersion: null, blueprints: [] };
  }

  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const blueprints = Array.isArray(parsed.blueprints) ? parsed.blueprints : [];

  return {
    catalogVersion:
      typeof parsed.catalogVersion === "string"
        ? parsed.catalogVersion
        : null,
    blueprints: blueprints.map(readBlueprint),
  };
}

async function writeBlueprintState(state: BlueprintState): Promise<void> {
  await mkdir(dirname(blueprintStatePath()), { recursive: true });
  await Bun.write(blueprintStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

function readModule(value: unknown): HabitatModule {
  const parsed = readRecord(value, "module");

  return {
    id: readString(parsed.id, "module.id"),
    blueprintId: readString(parsed.blueprintId, "module.blueprintId"),
    displayName: readString(parsed.displayName, "module.displayName"),
    connectedTo: readStringArray(parsed.connectedTo, "module.connectedTo"),
    runtimeAttributes: readJsonRecord(
      parsed.runtimeAttributes,
      "module.runtimeAttributes",
    ),
    capabilities: readStringArray(parsed.capabilities, "module.capabilities"),
  };
}

function readBlueprint(value: unknown): ProductionBlueprint {
  const parsed = readRecord(value, "blueprint");

  return {
    id: readString(parsed.id, "blueprint.id"),
    blueprintId: readString(parsed.blueprintId, "blueprint.blueprintId"),
    displayName: readString(parsed.displayName, "blueprint.displayName"),
    description: readOptionalString(parsed.description),
    status: readString(parsed.status, "blueprint.status") as
      | "draft"
      | "published",
    output: readJsonRecord(parsed.output, "blueprint.output"),
    inputs: readJsonRecord(parsed.inputs, "blueprint.inputs"),
    productionCost: readOptionalJsonRecord(parsed.productionCost),
    requiredFacility: readOptionalJsonRecord(parsed.requiredFacility),
    buildTicks: readNumber(parsed.buildTicks, "blueprint.buildTicks"),
    prerequisites: readOptionalStringArray(parsed.prerequisites),
    unlocks: readOptionalStringArray(parsed.unlocks),
    repeatable: readBoolean(parsed.repeatable, "blueprint.repeatable"),
    level: readOptionalNumberOrNull(parsed.level),
    target: readOptionalJsonRecord(parsed.target),
    facilityLevel: readOptionalJsonRecord(parsed.facilityLevel),
    attachmentPoints: readOptionalJsonRecord(parsed.attachmentPoints),
    attachmentRequirements: readOptionalJsonArray(parsed.attachmentRequirements),
    runtimeAttributes: readJsonRecord(
      parsed.runtimeAttributes,
      "blueprint.runtimeAttributes",
    ),
    capabilities: readStringArray(parsed.capabilities, "blueprint.capabilities"),
  };
}

function cloneModules(modules: HabitatModule[]): HabitatModule[] {
  return modules.map(cloneModule);
}

function hydrateStarterModules(
  modules: StarterModuleInstance[],
): HabitatModule[] {
  const hydrated: HabitatModule[] = [];
  const originalToLocalId = new Map<string, string>();

  for (const starterModule of modules) {
    const localId = createSequentialModuleId(
      hydrated,
      starterModule.blueprintId,
    );

    originalToLocalId.set(starterModule.id, localId);
    hydrated.push({
      id: localId,
      blueprintId: starterModule.blueprintId,
      displayName: starterModule.displayName,
      connectedTo: starterModule.connectedTo.map(
        (connectedId) => originalToLocalId.get(connectedId) ?? connectedId,
      ),
      runtimeAttributes: cloneJsonRecord(starterModule.runtimeAttributes),
      capabilities: [...starterModule.capabilities],
    });
  }

  return hydrated;
}

function cloneModule(module: HabitatModule): HabitatModule {
  return {
    id: module.id,
    blueprintId: module.blueprintId,
    displayName: module.displayName,
    connectedTo: [...module.connectedTo],
    runtimeAttributes: cloneJsonRecord(module.runtimeAttributes),
    capabilities: [...module.capabilities],
  };
}

function cloneBlueprints(
  blueprints: ProductionBlueprint[],
): ProductionBlueprint[] {
  return blueprints.map(cloneBlueprint);
}

function cloneBlueprint(blueprint: ProductionBlueprint): ProductionBlueprint {
  return {
    ...blueprint,
    prerequisites: [...(blueprint.prerequisites ?? [])],
    unlocks: [...(blueprint.unlocks ?? [])],
    capabilities: [...blueprint.capabilities],
    output: cloneJsonRecord(blueprint.output),
    inputs: cloneJsonRecord(blueprint.inputs),
    productionCost: cloneOptionalJsonRecord(blueprint.productionCost),
    requiredFacility: cloneOptionalJsonRecord(blueprint.requiredFacility),
    target: cloneOptionalJsonRecord(blueprint.target),
    facilityLevel: cloneOptionalJsonRecord(blueprint.facilityLevel),
    attachmentPoints: cloneOptionalJsonRecord(blueprint.attachmentPoints),
    runtimeAttributes: cloneJsonRecord(blueprint.runtimeAttributes),
    attachmentRequirements: Array.isArray(blueprint.attachmentRequirements)
      ? blueprint.attachmentRequirements.map((item) =>
          cloneJsonRecord(item as JsonRecord),
        )
      : [],
  };
}

function mergeBlueprints(
  current: ProductionBlueprint[],
  incoming: ProductionBlueprint[],
): ProductionBlueprint[] {
  const byBlueprintId = new Map<string, ProductionBlueprint>();

  for (const blueprint of current) {
    byBlueprintId.set(blueprint.blueprintId, blueprint);
  }

  for (const blueprint of incoming) {
    byBlueprintId.set(blueprint.blueprintId, cloneBlueprint(blueprint));
  }

  return [...byBlueprintId.values()];
}

function readRecord(value: unknown, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Habitat module state field '${field}' must be an object.`);
  }

  return value as JsonRecord;
}

function readJsonRecord(value: unknown, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Habitat module state field '${field}' must be an object.`);
  }

  return cloneJsonRecord(value as JsonRecord);
}

function cloneJsonRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function cloneOptionalJsonRecord(value: unknown): JsonRecord {
  return cloneJsonRecord(value);
}

function readOptionalJsonRecord(value: unknown): JsonRecord {
  return cloneJsonRecord(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Habitat module state field '${field}' must be a string.`);
  }

  return value;
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Habitat module state field '${field}' must be an array of strings.`,
    );
  }

  return value.map((item, index) => readString(item, `${field}[${index}]`));
}

function readOptionalStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function readOptionalJsonArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => cloneJsonRecord(item as JsonRecord))
    : [];
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Habitat module state field '${field}' must be a number.`);
  }

  return value;
}

function readOptionalNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Habitat module state field '${field}' must be a boolean.`);
  }

  return value;
}

function normalizeOptionalName(value: string, field: string): string {
  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(`Module ${field} must be a non-empty string.`);
  }

  return trimmed;
}

function createSequentialModuleId(
  modules: HabitatModule[],
  sourceId: string,
): string {
  const slug = slugify(sourceId);
  const prefix = `${slug}-`;
  let maxSequence = 0;

  for (const module of modules) {
    if (!module.id.startsWith(prefix)) {
      continue;
    }

    const suffix = module.id.slice(prefix.length);

    if (!/^\d+$/.test(suffix)) {
      continue;
    }

    maxSequence = Math.max(maxSequence, Number(suffix));
  }

  return `${slug}-${maxSequence + 1}`;
}

function slugify(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return normalized === "" ? "module" : normalized;
}
