// Response-shape mirrors of the Habitat REST API. These are types only — all
// behavior stays server-side. Keep in sync with the backend sources noted below.

// src/kepler.ts (Registration)
export type Registration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
};

// src/kepler.ts (HabitatRecord)
export type HabitatRecord = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt: string | null;
};

// src/modules.ts (HabitatModule). runtimeAttributes is a free-form JSON blob;
// read fields from it defensively.
export type HabitatModule = {
  id: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

// src/kepler.ts (SolarIrradiance)
export type SolarIrradiance = {
  wPerM2: number;
  condition: string;
};

// src/tick.ts (TickSummary)
export type TickSummary = {
  ticks: number;
  powerDrawKw: number;
  energyConsumedKwh: number;
  batteryEnergyKwh: number;
  batteryCapacityKwh: number;
  hasBattery: boolean;
  completions: unknown[];
  constructionStalled: boolean;
  solarGeneratedKwh: number;
  solarWPerM2: number | null;
  solarCondition: string | null;
  solarSkipReason: string | null;
};

// GET /status (src/server/app.ts)
export type StatusResponse = {
  registration: Registration | null;
  habitat: HabitatRecord | null;
  reachable: boolean;
  modules: number;
  error?: string;
};

// POST /registration → HydrationSummary (src/hydration.ts)
export type HydrationSummary = {
  modulesHydrated: number;
  humansHydrated: number;
  blueprintsCached: number;
  alertContractVersion: string;
};

// src/humans.ts (Human)
export type Human = {
  id: string;
  displayName: string;
  locationModuleId: string;
};

// src/inventory.ts (InventoryEntry)
export type InventoryEntry = {
  resource: string;
  quantity: number;
};

// src/eva-state.ts (CarriedResource)
export type CarriedResource = {
  resource: string;
  quantityKg: number;
};

// src/eva.ts (EvaStatus)
export type EvaStatus = {
  deployed: boolean;
  human: Human | null;
  suitportModuleId: string | null;
  position: { x: number; y: number } | null;
  carried: CarriedResource[];
  carriedTotalKg: number;
  maxCarryKg: number | null;
  remainingCapacityKg: number | null;
};

// POST /eva/dock (src/eva.ts dockExplorer) — note the EVA status arrives
// under `status`, not `eva`.
export type DockResult = {
  status: EvaStatus;
  unloaded: CarriedResource[];
  humanId: string;
  suitportModuleId: string;
};

// POST /eva/collect (src/eva.ts collectMaterial) — same `status` key.
export type CollectResult = {
  status: EvaStatus;
  resourceType: string;
  collectedKg: number;
  remainingKg: number;
};

// src/kepler.ts (WorldScan*) — a scan is a probability estimate, never truth.
export type WorldScanProbability = {
  resourceType: string | null;
  probabilityPct: number;
};

export type WorldScanQuantityEstimate = {
  resourceType: string;
  unit: string;
  estimatedKg: number;
  minimumKg: number;
  maximumKg: number;
  exact: boolean;
};

export type WorldScanTile = {
  x: number;
  y: number;
  terrain: string;
  distanceTiles: number;
  probabilities: WorldScanProbability[];
  topCandidate: WorldScanProbability;
  quantityEstimate: WorldScanQuantityEstimate | null;
};

export type WorldScan = {
  modelVersion: string;
  origin: { x: number; y: number };
  sensorStrength: number;
  radiusTiles: number;
  tiles: WorldScanTile[];
};

// src/alerts.ts (Alert)
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export type AlertSubject = {
  type: "module" | "human";
  id: string;
};

export type Alert = {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  subject?: AlertSubject;
  details?: Record<string, string | number | boolean>;
  openedAt: string;
  lastObservedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  occurrenceCount: number;
};

// src/construction.ts
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

export type StartConstructionResult = {
  facilityId: string;
  job: ConstructionJob;
};

export type ActiveConstruction = {
  facilityId: string;
  facilityName: string;
  job: ConstructionJob;
};

// src/kepler.ts (ProductionBlueprint) — Kepler reference data. Optional and
// loosely-typed fields are read defensively.
export type ProductionBlueprint = {
  id: string;
  blueprintId: string;
  displayName: string;
  description: string;
  status: "draft" | "published";
  output: Record<string, unknown>;
  inputs: Record<string, unknown>;
  productionCost?: Record<string, unknown>;
  requiredFacility?: Record<string, unknown>;
  buildTicks: number;
  prerequisites?: string[];
  unlocks?: string[];
  repeatable: boolean;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
  [key: string]: unknown;
};

export type BlueprintCatalogResponse = {
  catalogVersion: string;
  blueprints: ProductionBlueprint[];
};

// src/kepler.ts (ResourceCatalogEntry)
export type ResourceCatalogEntry = {
  id: string;
  resourceType: string;
  displayName: string;
  kind: string;
  rarity: string;
  description: string;
  unit: string;
};

export type ResourceCatalogResponse = {
  catalogVersion: string;
  resources: ResourceCatalogEntry[];
};
