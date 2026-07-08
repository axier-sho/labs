import { renderTable } from "./format";
import {
  fetchBlueprintCatalog,
  fetchResourceCatalog,
  type ProductionBlueprint,
  type ResourceCatalogEntry,
} from "./kepler";

// This module is read-only against the Kepler catalog: it fetches official
// reference data and formats it for display. It never writes local state, so it
// is deliberately kept separate from module/inventory logic. Three ideas stay
// distinct here:
//   - resource catalog:    resource *types* that can exist in the Kepler world
//   - local inventory:     resources the habitat actually owns (handled elsewhere)
//   - blueprint inputs:    resources/modules *needed to build* something later

export async function listBlueprints(
  baseUrl?: string,
): Promise<ProductionBlueprint[]> {
  const { blueprints } = await fetchBlueprintCatalog(baseUrl);

  return blueprints;
}

export async function showBlueprint(
  blueprintId: string,
  baseUrl?: string,
): Promise<ProductionBlueprint> {
  const { blueprints } = await fetchBlueprintCatalog(baseUrl);
  const blueprint = blueprints.find(
    (candidate) => candidate.blueprintId === blueprintId,
  );

  if (blueprint === undefined) {
    throw new Error(
      `Blueprint '${blueprintId}' was not found in the Kepler catalog.`,
    );
  }

  return blueprint;
}

export async function listResources(
  baseUrl?: string,
): Promise<ResourceCatalogEntry[]> {
  const { resources } = await fetchResourceCatalog(baseUrl);

  return resources;
}

export function formatBlueprintTable(
  blueprints: ProductionBlueprint[],
): string {
  if (blueprints.length === 0) {
    return "No blueprints available.";
  }

  const rows = blueprints.map((blueprint) => [
    blueprint.blueprintId,
    blueprint.displayName,
    blueprint.status,
    String(blueprint.buildTicks),
    blueprint.repeatable ? "yes" : "no",
  ]);

  return renderTable(
    ["Blueprint", "Name", "Status", "Build ticks", "Repeatable"],
    rows,
  );
}

export function formatBlueprintDetails(blueprint: ProductionBlueprint): string {
  const lines = [
    `Blueprint: ${blueprint.blueprintId}`,
    `Name:      ${blueprint.displayName}`,
    `Status:    ${blueprint.status}`,
    `Build ticks: ${blueprint.buildTicks}`,
    `Repeatable:  ${blueprint.repeatable ? "yes" : "no"}`,
  ];

  if (blueprint.level !== undefined && blueprint.level !== null) {
    lines.push(`Level:     ${blueprint.level}`);
  }

  if (blueprint.description.trim() !== "") {
    lines.push("", "Description:", blueprint.description);
  }

  // Requirements needed to *build* this blueprint — not resources the habitat
  // owns. Rendered as-is from the catalog so the distinction stays obvious.
  lines.push("", jsonSection("Inputs (needed to build)", blueprint.inputs));
  lines.push(jsonSection("Output (produced)", blueprint.output));

  if (hasKeys(blueprint.productionCost)) {
    lines.push(jsonSection("Production cost", blueprint.productionCost));
  }

  if (hasKeys(blueprint.requiredFacility)) {
    lines.push(jsonSection("Required facility", blueprint.requiredFacility));
  }

  lines.push(commaSection("Prerequisites", blueprint.prerequisites));
  lines.push(commaSection("Unlocks", blueprint.unlocks));
  lines.push(commaSection("Capabilities", blueprint.capabilities));

  return lines.join("\n");
}

export function formatResourceTable(
  resources: ResourceCatalogEntry[],
): string {
  // Make the boundary explicit: this is the world's catalog of possible resource
  // types, NOT the habitat's inventory of owned resources.
  const heading =
    "Resource types defined in the Kepler catalog (not resources your habitat owns).";

  if (resources.length === 0) {
    return `${heading}\n\nNo resource types available.`;
  }

  const rows = resources.map((resource) => [
    resource.resourceType,
    resource.displayName,
    resource.kind,
    resource.rarity,
    resource.unit,
  ]);

  const table = renderTable(
    ["Resource", "Name", "Kind", "Rarity", "Unit"],
    rows,
  );

  return `${heading}\n\n${table}`;
}

function jsonSection(label: string, value: unknown): string {
  return `${label}:\n${JSON.stringify(value ?? {}, null, 2)}`;
}

function commaSection(label: string, values: string[] | undefined): string {
  const list = values ?? [];

  return `${label}: ${list.length === 0 ? "none" : list.join(", ")}`;
}

function hasKeys(value: Record<string, unknown> | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
}
