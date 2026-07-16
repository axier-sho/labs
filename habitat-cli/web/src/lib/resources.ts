// Resource identity colors. The named entries cover the Kepler resource
// catalog (plus the design guideline's example names); anything new gets a
// stable color from the fallback palette so the map and lists never go gray.
const RESOURCE_COLORS: Record<string, string> = {
  // Kepler catalog resource types.
  "ice-regolith": "#8fb8c9",
  water: "#7fa8d9",
  ferrite: "#c98f84",
  "conductive-ore": "#d9a86a",
  "basalt-composite": "#b29b72",
  "silicate-glass": "#a9c9c4",
  "volatile-compounds": "#a99bc9",
  "rare-catalyst": "#d3b577",
  oxygen: "#93c6a2",
  food: "#a8c97f",
  // Design guideline example names, kept as aliases.
  "water-ice": "#8fb8c9",
  regolith: "#b29b72",
  "iron-ore": "#c98f84",
  polymer: "#a99bc9",
};

const FALLBACK_PALETTE = [
  "#c9b38f",
  "#8fc9b8",
  "#b88fc9",
  "#c98fa8",
  "#8f9dc9",
  "#c9c48f",
];

export function resourceColor(resource: string): string {
  const named = RESOURCE_COLORS[resource];
  if (named !== undefined) return named;
  let hash = 0;
  for (let i = 0; i < resource.length; i++) {
    hash = (hash * 31 + resource.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}
