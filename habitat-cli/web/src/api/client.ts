import type {
  ActiveConstruction,
  Alert,
  BlueprintCatalogResponse,
  CollectResult,
  ConstructionEvaluation,
  DockResult,
  EvaStatus,
  HabitatModule,
  Human,
  HydrationSummary,
  InventoryEntry,
  ProductionBlueprint,
  Registration,
  ResourceCatalogResponse,
  SolarIrradiance,
  StartConstructionResult,
  StatusResponse,
  TickSummary,
  WorldScan,
} from "./types";

// In dev the Vite proxy forwards /api/* to the Habitat server; the production
// build is served by that server directly, so requests are same-origin.
const API_BASE = import.meta.env.DEV ? "/api" : "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the Habitat API. Is the server running (bun run server)?",
      0,
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; fall through to the status check.
  }

  if (!response.ok) {
    const message =
      payload !== null &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function getRegistration() {
  return request<{ registration: Registration | null }>("GET", "/registration");
}

export function register(name: string) {
  return request<{ registration: Registration; summary: HydrationSummary }>(
    "POST",
    "/registration",
    { name },
  );
}

export function unregister() {
  return request<{ registration: Registration }>("DELETE", "/registration");
}

export function getStatus() {
  return request<StatusResponse>("GET", "/status");
}

export function getModules() {
  return request<{ modules: HabitatModule[] }>("GET", "/modules");
}

export type ModulePatch = {
  displayName?: string;
  connectedTo?: string[];
  status?: string;
  condition?: number;
};

export function patchModule(id: string, patch: ModulePatch) {
  return request<{ module: HabitatModule }>(
    "PATCH",
    `/modules/${encodeURIComponent(id)}`,
    patch,
  );
}

export function patchModuleStatus(id: string, status: string) {
  return patchModule(id, { status });
}

export function getModule(id: string) {
  return request<{ module: HabitatModule }>(
    "GET",
    `/modules/${encodeURIComponent(id)}`,
  );
}

export function createModule(blueprintId: string, displayName?: string) {
  return request<{ module: HabitatModule }>("POST", "/modules", {
    blueprintId,
    ...(displayName === undefined ? {} : { displayName }),
  });
}

export function deleteModule(id: string) {
  return request<{ module: HabitatModule }>(
    "DELETE",
    `/modules/${encodeURIComponent(id)}`,
  );
}

export function getHumans() {
  return request<{ humans: Human[] }>("GET", "/humans");
}

export function moveHuman(id: string, locationModuleId: string) {
  return request<{ human: Human }>(
    "PATCH",
    `/humans/${encodeURIComponent(id)}`,
    { locationModuleId },
  );
}

export function getEva() {
  return request<{ eva: EvaStatus }>("GET", "/eva");
}

export function deployEva(humanId: string) {
  return request<{ eva: EvaStatus }>("POST", "/eva/deploy", { humanId });
}

export function moveEva(x: number, y: number) {
  return request<{ eva: EvaStatus }>("POST", "/eva/move", { x, y });
}

export function dockEva() {
  return request<DockResult>("POST", "/eva/dock");
}

export function collectEva(quantityKg: number) {
  return request<CollectResult>("POST", "/eva/collect", { quantityKg });
}

export function scanWorld(sensorStrength: number, radiusTiles: number) {
  const query = new URLSearchParams({
    sensorStrength: String(sensorStrength),
    radiusTiles: String(radiusTiles),
  });
  return request<{ scan: WorldScan }>("GET", `/world/scan?${query}`);
}

export function getAlerts() {
  return request<{ alerts: Alert[] }>("GET", "/alerts");
}

export function acknowledgeAlert(id: string) {
  return request<{ alert: Alert }>(
    "POST",
    `/alerts/${encodeURIComponent(id)}/acknowledge`,
  );
}

export function getInventory() {
  return request<{ inventory: InventoryEntry[] }>("GET", "/inventory");
}

export function addInventory(resource: string, quantity: number) {
  return request<{ entry: InventoryEntry }>("POST", "/inventory", {
    resource,
    quantity,
  });
}

export function getConstruction() {
  return request<{ active: ActiveConstruction[] }>("GET", "/construction");
}

export function evaluateConstruction(blueprintId: string) {
  return request<{ evaluation: ConstructionEvaluation }>(
    "POST",
    "/construction",
    { blueprintId, dryRun: true },
  );
}

export function startConstruction(blueprintId: string) {
  return request<StartConstructionResult>("POST", "/construction", {
    blueprintId,
  });
}

export function cancelConstruction(facilityId: string) {
  return request<{ facilityId: string }>(
    "DELETE",
    `/construction/${encodeURIComponent(facilityId)}`,
  );
}

export function getBlueprints() {
  return request<BlueprintCatalogResponse>("GET", "/catalog/blueprints");
}

export function getBlueprint(blueprintId: string) {
  return request<{ blueprint: ProductionBlueprint }>(
    "GET",
    `/catalog/blueprints/${encodeURIComponent(blueprintId)}`,
  );
}

export function getResources() {
  return request<ResourceCatalogResponse>("GET", "/catalog/resources");
}

export function getSolarIrradiance() {
  return request<{ solarIrradiance: SolarIrradiance }>("GET", "/solar/irradiance");
}

export function postTicks(count: number) {
  return request<{ summary: TickSummary }>("POST", "/ticks", { count });
}
