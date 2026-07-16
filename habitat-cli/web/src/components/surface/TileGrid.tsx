import type { EvaMapState } from "../../hooks/useEvaMap";
import { tileKey } from "../../hooks/useEvaMap";
import { resourceColor } from "../../lib/resources";

// Fixed 11×7 viewport around the habitat: x −5..5 across, y 3..−3 down.
// The explorer can legally walk beyond it; the position panel notes that.
export const VIEW_X = 5;
export const VIEW_Y = 3;

const TILE_SIZE = 36;

type TileProps = {
  x: number;
  y: number;
  known: EvaMapState;
  explorer: { x: number; y: number } | null;
  disabled: boolean;
  onMove: (x: number, y: number) => void;
};

function Tile({ x, y, known, explorer, disabled, onMove }: TileProps) {
  const entry = known[tileKey(x, y)];
  const isHabitat = x === 0 && y === 0;
  const isExplorer = explorer !== null && explorer.x === x && explorer.y === y;
  const adjacent =
    explorer !== null &&
    Math.abs(x - explorer.x) + Math.abs(y - explorer.y) === 1;
  const clickable = adjacent && !disabled;

  const candidate = entry?.tile.topCandidate;
  const deposit =
    candidate !== undefined && candidate.resourceType !== null
      ? candidate
      : null;

  let background = entry !== undefined ? "#1d1b17" : "var(--bg)";
  let border = entry !== undefined ? "var(--track)" : "var(--border-soft)";
  let glyph = "";
  let glyphColor = "var(--faint)";
  let glyphSize = 8;

  if (deposit !== null) {
    glyph = "●";
    glyphColor = resourceColor(deposit.resourceType ?? "");
  }
  if (isHabitat) {
    background = "var(--track)";
    border = "var(--accent)";
    glyph = "H";
    glyphColor = "var(--accent)";
    glyphSize = 12;
  }
  if (isExplorer) {
    background = "var(--accent)";
    border = "var(--accent-hover)";
    glyph = "◆";
    glyphColor = "var(--on-accent)";
    glyphSize = 13;
  }
  if (adjacent && !isExplorer) {
    border = "#4a4336";
  }

  const parts: string[] = [isHabitat ? "Habitat (0, 0)" : `(${x}, ${y})`];
  if (deposit !== null) {
    parts.push(`${deposit.resourceType} · ${deposit.probabilityPct}%`);
  } else if (entry !== undefined) {
    parts.push(entry.tile.terrain);
  } else {
    parts.push("unscanned");
  }
  if (clickable) parts.push("click to move");
  const title = parts.join(" · ");

  return (
    <button
      title={title}
      aria-label={title}
      disabled={!clickable}
      onClick={() => onMove(x, y)}
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        background,
        border: `1px solid ${border}`,
        cursor: clickable ? "pointer" : "default",
        padding: 0,
        transition: "filter 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (clickable) e.currentTarget.style.filter = "brightness(1.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "";
      }}
    >
      <span style={{ fontSize: glyphSize, lineHeight: 1, color: glyphColor }}>
        {glyph}
      </span>
    </button>
  );
}

function LegendItem({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {children}
    </span>
  );
}

export function TileGrid({
  known,
  explorer,
  disabled,
  onMove,
}: {
  known: EvaMapState;
  explorer: { x: number; y: number } | null;
  disabled: boolean;
  onMove: (x: number, y: number) => void;
}) {
  // Legend entries come from what scans have actually revealed.
  const seenResources = Array.from(
    new Set(
      Object.values(known)
        .map((entry) => entry.tile.topCandidate.resourceType)
        .filter((resource): resource is string => resource !== null),
    ),
  ).sort();

  const rows: React.ReactNode[] = [];
  for (let y = VIEW_Y; y >= -VIEW_Y; y--) {
    for (let x = -VIEW_X; x <= VIEW_X; x++) {
      rows.push(
        <Tile
          key={tileKey(x, y)}
          x={x}
          y={y}
          known={known}
          explorer={explorer}
          disabled={disabled}
          onMove={onMove}
        />,
      );
    }
  }

  return (
    <div style={{ flex: "none", opacity: explorer === null ? 0.55 : 1 }}>
      <div
        role="grid"
        aria-label="Surface map"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${VIEW_X * 2 + 1}, ${TILE_SIZE}px)`,
          gap: 3,
          background: "var(--bg)",
          padding: 10,
          borderRadius: 12,
          border: "1px solid var(--border-soft)",
          width: "fit-content",
        }}
      >
        {rows}
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 12,
          fontSize: 11,
          color: "var(--muted)",
          flexWrap: "wrap",
        }}
      >
        <LegendItem>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              background: "var(--track)",
              border: "1px solid var(--accent)",
              display: "inline-block",
            }}
          />
          habitat (0,0)
        </LegendItem>
        <LegendItem>
          <span style={{ color: "var(--accent)" }}>◆</span>explorer
        </LegendItem>
        {seenResources.map((resource) => (
          <LegendItem key={resource}>
            <span style={{ color: resourceColor(resource) }}>●</span>
            {resource}
          </LegendItem>
        ))}
        <LegendItem>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              background: "var(--bg)",
              border: "1px solid var(--border-soft)",
              display: "inline-block",
            }}
          />
          unscanned
        </LegendItem>
      </div>
    </div>
  );
}
