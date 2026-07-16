import { getDb, databasePath } from "./db";

// Kepler planet server contract (see https://planet.turingguild.com/docs and
// /openapi.json). All habitat endpoints use bearer auth:
//   Authorization: Bearer <token>
// The token is a shared, service-level credential, not per-habitat. Local dev
// falls back to "admin-dev-token".
const DEFAULT_BASE_URL = "https://planet.turingguild.com";
const DEFAULT_TOKEN = "admin-dev-token";

// Local registration state now lives in the CLI-owned SQLite database
// (see src/db.ts). `databasePath` is re-exported so commands can tell the user
// where their local state is kept.
export { databasePath };

// The live-clock stream descriptor returned by registration. `subscriptions`
// bounds what the WebSocket may ask for; `currentTick` is the planet clock at
// registration time (a starting reference only — ticks missed before listening
// are never replayed).
export type StreamMetadata = {
  protocolVersion: string;
  subscriptions: string[];
  currentTick: number;
  ticksPerPulse: number;
  tickIntervalMs: number;
  status: string;
};

export type Registration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
  // Kepler live-clock stream credentials. Null on a legacy registration made
  // before Kepler served a clock; re-running `habitat register` upgrades it.
  // streamApiToken is a live credential: `habitat status` reveals it to the
  // operator on purpose, but it is never logged and never committed to Git.
  streamUrl: string | null;
  streamApiToken: string | null;
  stream: StreamMetadata | null;
};

// Server-returned habitat record (GET /habitats/{habitatId}).
export type HabitatRecord = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt: string | null;
};

// The registration response is the source of truth for the habitat's starting
// crew and infrastructure. Nothing in it is duplicated as a hard-coded literal.
export type RegisterResponse = {
  habitatId: string;
  streamUrl: string;
  // Habitat-specific WebSocket credential — NOT the bearer token used to
  // authorize this registration request. It authenticates the WebSocket hello.
  apiToken: string;
  stream: StreamMetadata;
  starterModules: StarterModuleInstance[];
  starterHumans: StarterHuman[];
  blueprints: ProductionBlueprint[];
  contracts: HabitatContracts;
};

// One of the habitat's starting crew. `locationModuleId` refers to a *starter
// module* id as Kepler numbered it, which is not the habitat-local module id —
// see hydrateStarterModules in src/modules.ts for the translation.
export type StarterHuman = {
  id: string;
  displayName: string;
  locationModuleId: string;
};

// contracts.alerts is the shared definition of an alert record. Kepler does not
// store or manage alerts; it just tells every habitat what one has to look like.
export type AlertContract = {
  schemaVersion: string;
  schema: Record<string, unknown>;
};

export type HabitatContracts = {
  alerts: AlertContract;
};

export type StarterModuleTemplate = {
  blueprintId: string;
  displayName: string;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type StarterModuleInstance = StarterModuleTemplate & {
  id: string;
  connectedTo: string[];
};

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
  level?: number | null;
  target?: Record<string, unknown>;
  facilityLevel?: Record<string, unknown>;
  attachmentPoints?: Record<string, unknown>;
  attachmentRequirements?: Array<Record<string, unknown>>;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
  [key: string]: unknown;
};

export type BlueprintCatalogResponse = {
  catalogVersion: string;
  blueprints: ProductionBlueprint[];
};

// A resource catalog entry describes a *type* of resource that can exist in the
// Kepler world (GET /catalog/resources). It is reference data only: it does not
// mean the habitat owns any of that resource.
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

// The planet server owns the environmental sunlight reading
// (GET /world/solar-irradiance). `wPerM2` is the usable irradiance in watts per
// square metre; `condition` is a human-readable label such as "clear" or "dust".
export type SolarIrradiance = {
  wPerM2: number;
  condition: string;
};

export type SolarIrradianceResponse = {
  solarIrradiance: SolarIrradiance;
};

// --- World scan ----------------------------------------------------------
// Kepler owns the hidden resource truth and the remaining quantity of every
// tile. A scan never returns that truth: it returns a probability distribution
// derived from the sensor strength and distance the Habitat reports. A
// `resourceType` of null is the "none" candidate (an empty tile).

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

export type WorldScanResponse = { scan: WorldScan };

export type WorldScanRequest = {
  habitatId: string;
  x: number;
  y: number;
  sensorStrength: number;
  radiusTiles: number;
};

// --- World sectors -------------------------------------------------------
// The sector is Kepler's, not ours: it decides how far a habitat may roam. The
// bounds are read live rather than assumed, so a resized or re-centred sector
// needs no change here.

export type SectorBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type WorldSector = {
  id: string;
  displayName: string;
  origin: { x: number; y: number };
  bounds: SectorBounds;
  tileSizeMeters: number;
  supportedTerrains: string[];
};

export async function fetchCurrentSector(
  habitatId: string,
  baseUrl?: string,
): Promise<WorldSector> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const query = new URLSearchParams({ habitatId });

  const body = (await request(
    resolvedBaseUrl,
    "GET",
    `/world/sectors/current?${query.toString()}`,
  )) as { sector?: WorldSector };

  const sector = body?.sector;

  if (
    typeof sector !== "object" ||
    sector === null ||
    typeof sector.bounds?.minX !== "number"
  ) {
    throw new Error("Kepler returned no current sector.");
  }

  return sector;
}

// --- World collect -------------------------------------------------------
// Kepler owns which material is on a tile and how much of it is left. The
// habitat never learns that truth except by successfully taking some, and the
// deduction is atomic on Kepler's side.

export type WorldCollection = {
  x: number;
  y: number;
  resourceType: string;
  unit: string;
  collectedKg: number;
  remainingKg: number;
};

export type WorldCollectRequest = {
  habitatId: string;
  x: number;
  y: number;
  quantityKg: number;
};

export async function collectFromWorld(
  params: WorldCollectRequest,
  baseUrl?: string,
): Promise<WorldCollection> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const body = (await request(resolvedBaseUrl, "POST", "/world/collect", {
    habitatId: params.habitatId,
    x: params.x,
    y: params.y,
    quantityKg: params.quantityKg,
  })) as { collection?: WorldCollection };

  const collection = body?.collection;

  if (
    typeof collection !== "object" ||
    collection === null ||
    typeof collection.collectedKg !== "number" ||
    typeof collection.resourceType !== "string"
  ) {
    throw new Error("Kepler returned no collection result.");
  }

  return collection;
}

export async function fetchWorldScan(
  params: WorldScanRequest,
  baseUrl?: string,
): Promise<WorldScanResponse> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const query = new URLSearchParams({
    habitatId: params.habitatId,
    x: String(params.x),
    y: String(params.y),
    sensorStrength: String(params.sensorStrength),
    radiusTiles: String(params.radiusTiles),
  });

  const body = (await request(
    resolvedBaseUrl,
    "GET",
    `/world/scan?${query.toString()}`,
  )) as WorldScanResponse;

  if (typeof body?.scan !== "object" || !Array.isArray(body?.scan?.tiles)) {
    throw new Error("Kepler returned no world scan.");
  }

  return body;
}

export async function registerHabitat(name: string): Promise<{
  registration: Registration;
  response: RegisterResponse;
  upgrade: boolean;
}> {
  const displayName = name.trim();

  if (displayName === "") {
    throw new Error("Habitat name must be a non-empty string.");
  }

  const existing = await readRegistration();

  // A registration made before Kepler served a live clock has no stream token.
  // Re-registering then *upgrades in place*: reuse the same habitat UUID and
  // display name so Kepler returns fresh stream credentials for the existing
  // habitat, and keep the crew and modules exactly as they are.
  const upgrade = existing !== null && existing.streamApiToken === null;

  if (existing !== null && !upgrade) {
    throw new Error(
      `This habitat is already registered as '${existing.displayName}' (habitatId ${existing.habitatId}).\n` +
        "Run 'habitat unregister' first if you want to register again.",
    );
  }

  const baseUrl = existing !== null && upgrade ? existing.baseUrl : resolveBaseUrl();
  // The client mints the habitat UUID once; an upgrade reuses the original so
  // Kepler recognises the same habitat rather than minting a second one.
  const habitatUuid =
    existing !== null && upgrade ? existing.habitatUuid : crypto.randomUUID();
  const effectiveName =
    existing !== null && upgrade ? existing.displayName : displayName;

  const response = (await request(baseUrl, "POST", "/habitats/register", {
    habitatUuid,
    displayName: effectiveName,
  })) as RegisterResponse;

  validateRegisterResponse(response);

  const registration: Registration = {
    habitatId: response.habitatId,
    habitatUuid,
    displayName: effectiveName,
    baseUrl,
    registeredAt:
      existing !== null && upgrade
        ? existing.registeredAt
        : new Date().toISOString(),
    streamUrl: response.streamUrl,
    streamApiToken: response.apiToken,
    stream: response.stream,
  };

  // Deliberately not persisted here. On a fresh registration the caller commits
  // this row together with the starter modules and humans in one transaction, so
  // a habitat is never left registered but crewless. An upgrade instead just
  // updates this row, leaving the existing crew and modules untouched.
  return { registration, response, upgrade };
}

// Fail before touching local state if the response is missing anything the
// habitat is required to hydrate from it.
function validateRegisterResponse(response: RegisterResponse): void {
  if (typeof response?.habitatId !== "string" || response.habitatId === "") {
    throw new Error("Kepler did not return a habitatId.");
  }

  if (!Array.isArray(response.starterModules)) {
    throw new Error("Kepler returned no starterModules.");
  }

  if (!Array.isArray(response.starterHumans)) {
    throw new Error("Kepler returned no starterHumans.");
  }

  if (typeof response.contracts?.alerts?.schemaVersion !== "string") {
    throw new Error("Kepler returned no contracts.alerts definition.");
  }

  if (typeof response.streamUrl !== "string" || response.streamUrl === "") {
    throw new Error(
      "Kepler returned no streamUrl. This Habitat cannot connect to the live clock.",
    );
  }

  if (typeof response.apiToken !== "string" || response.apiToken === "") {
    throw new Error("Kepler returned no stream apiToken.");
  }

  const stream = response.stream;

  if (
    typeof stream !== "object" ||
    stream === null ||
    !Array.isArray(stream.subscriptions)
  ) {
    throw new Error("Kepler returned no stream metadata.");
  }
}

export async function fetchBlueprintCatalog(
  baseUrl?: string,
): Promise<BlueprintCatalogResponse> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const body = (await request(
    resolvedBaseUrl,
    "GET",
    "/catalog/blueprints",
  )) as BlueprintCatalogResponse;

  if (
    typeof body?.catalogVersion !== "string" ||
    !Array.isArray(body.blueprints)
  ) {
    throw new Error("Kepler returned no blueprint catalog.");
  }

  return body;
}

export async function fetchResourceCatalog(
  baseUrl?: string,
): Promise<ResourceCatalogResponse> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const body = (await request(
    resolvedBaseUrl,
    "GET",
    "/catalog/resources",
  )) as ResourceCatalogResponse;

  if (
    typeof body?.catalogVersion !== "string" ||
    !Array.isArray(body.resources)
  ) {
    throw new Error("Kepler returned no resource catalog.");
  }

  return body;
}

export async function fetchSolarIrradiance(
  baseUrl?: string,
): Promise<SolarIrradiance> {
  const resolvedBaseUrl =
    baseUrl !== undefined && baseUrl.trim() !== ""
      ? baseUrl.replace(/\/+$/, "")
      : resolveBaseUrl();

  const body = (await request(
    resolvedBaseUrl,
    "GET",
    "/world/solar-irradiance",
  )) as SolarIrradianceResponse;

  const irradiance = body?.solarIrradiance;

  if (
    typeof irradiance !== "object" ||
    irradiance === null ||
    typeof irradiance.wPerM2 !== "number" ||
    !Number.isFinite(irradiance.wPerM2)
  ) {
    throw new Error("Kepler returned no usable solar irradiance reading.");
  }

  return {
    wPerM2: irradiance.wPerM2,
    condition:
      typeof irradiance.condition === "string" && irradiance.condition !== ""
        ? irradiance.condition
        : "unknown",
  };
}

export async function fetchHabitatStatus(): Promise<{
  registration: Registration;
  habitat: HabitatRecord;
}> {
  const registration = await requireRegistration();

  const body = (await request(
    registration.baseUrl,
    "GET",
    `/habitats/${encodeURIComponent(registration.habitatId)}`,
  )) as { habitat?: HabitatRecord };

  if (body?.habitat === undefined) {
    throw new Error("Kepler returned no habitat record.");
  }

  return { registration, habitat: body.habitat };
}

export async function unregisterHabitat(): Promise<Registration> {
  const registration = await requireRegistration();

  await request(
    registration.baseUrl,
    "DELETE",
    `/habitats/${encodeURIComponent(registration.habitatId)}`,
  );

  await clearRegistration();

  return registration;
}

// The flat shape of the registration row: stream metadata is stored one value
// per column and reassembled into the nested `stream` object on read.
type RegistrationRow = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
  streamUrl: string | null;
  streamApiToken: string | null;
  streamProtocolVersion: string | null;
  streamSubscriptions: string | null;
  streamCurrentTick: number | null;
  streamTicksPerPulse: number | null;
  streamTickIntervalMs: number | null;
  streamStatus: string | null;
};

// Synchronous read. The SQLite query does no real I/O, so the WebSocket client's
// synchronous socket callbacks can read the saved registration (and its stream
// token) directly without threading a promise through.
export function readRegistrationSync(): Registration | null {
  const row = getDb()
    .query(
      "SELECT habitatId, habitatUuid, displayName, baseUrl, registeredAt, " +
        "streamUrl, streamApiToken, streamProtocolVersion, streamSubscriptions, " +
        "streamCurrentTick, streamTicksPerPulse, streamTickIntervalMs, streamStatus " +
        "FROM registration WHERE id = 1",
    )
    .get() as RegistrationRow | null;

  if (row === null) {
    return null;
  }

  return {
    habitatId: row.habitatId,
    habitatUuid: row.habitatUuid,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    registeredAt: row.registeredAt,
    streamUrl: row.streamUrl,
    streamApiToken: row.streamApiToken,
    stream: buildStreamMetadata(row),
  };
}

export async function readRegistration(): Promise<Registration | null> {
  return readRegistrationSync();
}

// Reassemble the nested stream descriptor from the flat columns, or null when
// this registration predates stream credentials.
function buildStreamMetadata(row: RegistrationRow): StreamMetadata | null {
  if (row.streamProtocolVersion === null) {
    return null;
  }

  let subscriptions: string[] = [];
  if (row.streamSubscriptions !== null) {
    try {
      const parsed = JSON.parse(row.streamSubscriptions);
      if (Array.isArray(parsed)) {
        subscriptions = parsed.map((value) => String(value));
      }
    } catch {
      subscriptions = [];
    }
  }

  return {
    protocolVersion: row.streamProtocolVersion,
    subscriptions,
    currentTick: row.streamCurrentTick ?? 0,
    ticksPerPulse: row.streamTicksPerPulse ?? 1,
    tickIntervalMs: row.streamTickIntervalMs ?? 0,
    status: row.streamStatus ?? "unknown",
  };
}

async function requireRegistration(): Promise<Registration> {
  const registration = await readRegistration();

  if (registration === null) {
    throw new Error(
      "This habitat is not registered yet.\n" +
        "Run 'habitat register --name \"<habitat name>\"' first.",
    );
  }

  return registration;
}

// Synchronous, and carries no transaction of its own, so registration hydration
// can commit this row alongside the starter modules and humans.
export function writeRegistrationSync(registration: Registration): void {
  const stream = registration.stream;

  getDb().run(
    "INSERT INTO registration " +
      "(id, habitatId, habitatUuid, displayName, baseUrl, registeredAt, " +
      "streamUrl, streamApiToken, streamProtocolVersion, streamSubscriptions, " +
      "streamCurrentTick, streamTicksPerPulse, streamTickIntervalMs, streamStatus) " +
      "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "habitatId = excluded.habitatId, " +
      "habitatUuid = excluded.habitatUuid, " +
      "displayName = excluded.displayName, " +
      "baseUrl = excluded.baseUrl, " +
      "registeredAt = excluded.registeredAt, " +
      "streamUrl = excluded.streamUrl, " +
      "streamApiToken = excluded.streamApiToken, " +
      "streamProtocolVersion = excluded.streamProtocolVersion, " +
      "streamSubscriptions = excluded.streamSubscriptions, " +
      "streamCurrentTick = excluded.streamCurrentTick, " +
      "streamTicksPerPulse = excluded.streamTicksPerPulse, " +
      "streamTickIntervalMs = excluded.streamTickIntervalMs, " +
      "streamStatus = excluded.streamStatus",
    [
      registration.habitatId,
      registration.habitatUuid,
      registration.displayName,
      registration.baseUrl,
      registration.registeredAt,
      registration.streamUrl,
      registration.streamApiToken,
      stream?.protocolVersion ?? null,
      stream === null ? null : JSON.stringify(stream.subscriptions),
      stream?.currentTick ?? null,
      stream?.ticksPerPulse ?? null,
      stream?.tickIntervalMs ?? null,
      stream?.status ?? null,
    ],
  );
}

async function clearRegistration(): Promise<void> {
  getDb().run("DELETE FROM registration WHERE id = 1");
}

async function request(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${resolveToken()}`,
        Accept: "application/json",
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.log(`[kepler] ${method} ${path} -> unreachable`);
    throw new Error(
      `Could not reach Kepler at ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Sanitized outbound-call log so the server terminal shows when the backend
  // reaches Kepler and what status came back. Deliberately logs only the method,
  // path, and status — never the bearer token, request body, or response body.
  console.log(`[kepler] ${method} ${path} -> ${response.status}`);

  if (!response.ok) {
    const detail = await readKeplerError(response);

    throw new KeplerHttpError(
      `Kepler ${method} ${path} failed (${response.status} ${response.statusText}).` +
        (detail === null ? "" : `\n${detail}`),
      response.status,
      detail,
    );
  }

  // 204 No Content (e.g. DELETE) and empty bodies have nothing to parse.
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();

  if (text.trim() === "") {
    return undefined;
  }

  return JSON.parse(text);
}

// A non-2xx from Kepler is not always a fault. A 4xx on /world/collect is
// Kepler answering a perfectly well-formed question about the world ("there is
// nothing there"), so callers need the status and the message separately in
// order to tell an answer apart from an outage.
export class KeplerHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Kepler's own human-readable explanation, when it sent one.
    readonly keplerMessage: string | null,
  ) {
    super(message);
    this.name = "KeplerHttpError";
  }
}

// Kepler reports errors as { "error": { "code", "message" } }. Dig out the
// message and fall back to the raw text, so a changed error shape degrades to
// something readable rather than to nothing.
async function readKeplerError(response: Response): Promise<string | null> {
  try {
    const text = await response.text();

    if (text.trim() === "") {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: unknown } | string;
      };
      const error = parsed.error;

      if (typeof error === "string" && error.trim() !== "") {
        return error.trim();
      }

      if (
        typeof error === "object" &&
        error !== null &&
        typeof error.message === "string" &&
        error.message.trim() !== ""
      ) {
        return error.message.trim();
      }
    } catch {
      // Not JSON; the raw text is the best we have.
    }

    return text.trim();
  } catch {
    return null;
  }
}

function resolveBaseUrl(): string {
  const value = process.env.KEPLER_BASE_URL?.trim();

  return value !== undefined && value !== ""
    ? value.replace(/\/+$/, "")
    : DEFAULT_BASE_URL;
}

function resolveToken(): string {
  // KEPLER_PLANET_TOKEN is the name used in the deployment env / .env;
  // KEPLER_TOKEN is accepted as an alias.
  const value = (
    process.env.KEPLER_PLANET_TOKEN ?? process.env.KEPLER_TOKEN
  )?.trim();

  return value !== undefined && value !== "" ? value : DEFAULT_TOKEN;
}
