import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

// Kepler planet server contract (see https://planet.turingguild.com/docs and
// /openapi.json). All habitat endpoints use bearer auth:
//   Authorization: Bearer <token>
// The token is a shared, service-level credential, not per-habitat. Local dev
// falls back to "admin-dev-token".
const DEFAULT_BASE_URL = "https://planet.turingguild.com";
const DEFAULT_TOKEN = "admin-dev-token";

// Local registration state lives beside the habitat data file so both share the
// project's .habitat directory.
export const registrationPath = join(
  process.cwd(),
  ".habitat",
  "registration.json",
);

export type Registration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
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

type RegisterResponse = {
  habitatId: string;
  starterModules: StarterModuleInstance[];
  blueprints: ProductionBlueprint[];
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

export async function registerHabitat(name: string): Promise<{
  registration: Registration;
  response: RegisterResponse;
}> {
  const displayName = name.trim();

  if (displayName === "") {
    throw new Error("Habitat name must be a non-empty string.");
  }

  const existing = await readRegistration();

  if (existing !== null) {
    throw new Error(
      `This habitat is already registered as '${existing.displayName}' (habitatId ${existing.habitatId}).\n` +
        "Run 'habitat unregister' first if you want to register again.",
    );
  }

  const baseUrl = resolveBaseUrl();
  // The client mints the habitat UUID; the server returns the habitatId.
  const habitatUuid = crypto.randomUUID();

  const response = (await request(baseUrl, "POST", "/habitats/register", {
    habitatUuid,
    displayName,
  })) as RegisterResponse;

  if (typeof response?.habitatId !== "string" || response.habitatId === "") {
    throw new Error("Kepler did not return a habitatId.");
  }

  const registration: Registration = {
    habitatId: response.habitatId,
    habitatUuid,
    displayName,
    baseUrl,
    registeredAt: new Date().toISOString(),
  };

  await writeRegistration(registration);

  return { registration, response };
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

export async function readRegistration(): Promise<Registration | null> {
  const file = Bun.file(registrationPath);

  if (!(await file.exists())) {
    return null;
  }

  const contents = await file.text();

  if (contents.trim() === "") {
    return null;
  }

  const parsed = JSON.parse(contents) as Record<string, unknown>;

  return {
    habitatId: readString(parsed.habitatId, "habitatId"),
    habitatUuid: readString(parsed.habitatUuid, "habitatUuid"),
    displayName: readString(parsed.displayName, "displayName"),
    baseUrl: readString(parsed.baseUrl, "baseUrl"),
    registeredAt: readString(parsed.registeredAt, "registeredAt"),
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

async function writeRegistration(registration: Registration): Promise<void> {
  await mkdir(dirname(registrationPath), { recursive: true });
  await Bun.write(
    registrationPath,
    `${JSON.stringify(registration, null, 2)}\n`,
  );
}

async function clearRegistration(): Promise<void> {
  await rm(registrationPath, { force: true });
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
    throw new Error(
      `Could not reach Kepler at ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Kepler ${method} ${path} failed (${response.status} ${response.statusText}).${await describeErrorBody(response)}`,
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

async function describeErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();

    return text.trim() === "" ? "" : `\n${text.trim()}`;
  } catch {
    return "";
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

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${registrationPath} field '${field}' must be a string.`);
  }

  return value;
}
