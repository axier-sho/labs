import type { ProductionBlueprint } from "../../api/types";

export function BlueprintList({
  blueprints,
  selectedId,
  onSelect,
}: {
  blueprints: ProductionBlueprint[];
  selectedId: string | null;
  onSelect: (blueprintId: string) => void;
}) {
  return (
    <section className="card" aria-label="Blueprints">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <span className="section-label">Blueprints</span>
        <span className="tabular" style={{ fontSize: 12, color: "var(--faint)" }}>
          {blueprints.length} available
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {blueprints.map((blueprint) => {
          const selected = blueprint.blueprintId === selectedId;
          return (
            <button
              key={blueprint.blueprintId}
              aria-pressed={selected}
              onClick={() => onSelect(blueprint.blueprintId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 10px",
                margin: "0 -10px",
                borderRadius: 10,
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                background: selected ? "var(--track)" : "transparent",
                color: "inherit",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: selected ? 600 : 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {blueprint.displayName}
                </div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>
                  {blueprint.blueprintId}
                </div>
              </div>
              <span
                className="tabular"
                style={{ fontSize: 11.5, color: "var(--muted)", flex: "none" }}
              >
                {blueprint.buildTicks.toLocaleString("en-US")} ticks
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
