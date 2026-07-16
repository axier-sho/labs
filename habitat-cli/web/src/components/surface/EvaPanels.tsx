import { useState } from "react";
import type { EvaStatus, HabitatModule, Human } from "../../api/types";
import type { KnownTile } from "../../hooks/useEvaMap";
import { formatKg } from "../../lib/format";
import { resourceColor } from "../../lib/resources";
import { VIEW_X, VIEW_Y } from "./TileGrid";

export function PositionPanel({ eva }: { eva: EvaStatus }) {
  const position = eva.position;
  const offMap =
    position !== null &&
    (Math.abs(position.x) > VIEW_X || Math.abs(position.y) > VIEW_Y);

  return (
    <div className="inner-panel">
      <div className="mini-label" style={{ marginBottom: 6 }}>
        Position
      </div>
      <div className="display tabular" style={{ fontSize: 24, lineHeight: 1 }}>
        {position === null ? "—" : `(${position.x}, ${position.y})`}
      </div>
      {offMap && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--faint)" }}>
          ◆ off-map — beyond the charted viewport
        </div>
      )}
    </div>
  );
}

export function TileSurveyPanel({ entry }: { entry: KnownTile | undefined }) {
  let label = "Unscanned";
  let color = "var(--faint)";
  let detail: string | null = null;

  if (entry !== undefined) {
    const { topCandidate, quantityEstimate, terrain } = entry.tile;
    if (topCandidate.resourceType !== null) {
      label = `${topCandidate.resourceType} · ${topCandidate.probabilityPct}%`;
      color = resourceColor(topCandidate.resourceType);
      if (quantityEstimate !== null) {
        detail = quantityEstimate.exact
          ? `${formatKg(quantityEstimate.estimatedKg, 0)} kg`
          : `est ${formatKg(quantityEstimate.estimatedKg, 0)} kg (${formatKg(
              quantityEstimate.minimumKg,
              0,
            )}–${formatKg(quantityEstimate.maximumKg, 0)})`;
      }
    } else {
      label = "Barren tile";
      color = "var(--muted)";
      detail = terrain;
    }
  }

  return (
    <div className="inner-panel">
      <div className="mini-label" style={{ marginBottom: 6 }}>
        Tile survey
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color, paddingTop: 4 }}>
        {label}
      </div>
      {detail !== null && (
        <div className="tabular" style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)" }}>
          {detail}
        </div>
      )}
    </div>
  );
}

export function CarriedLoadPanel({ eva }: { eva: EvaStatus }) {
  const maxKg = eva.maxCarryKg;
  const pct =
    maxKg !== null && maxKg > 0
      ? Math.min(100, Math.round((eva.carriedTotalKg / maxKg) * 100))
      : 0;

  return (
    <div className="inner-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span className="mini-label">Carried load</span>
        <span className="tabular" style={{ fontSize: 12.5 }}>
          {formatKg(eva.carriedTotalKg)}
          {maxKg !== null ? ` / ${formatKg(maxKg, 0)}` : ""} kg
        </span>
      </div>
      <div className="track" style={{ height: 5, marginBottom: 10 }}>
        <div className="track-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {eva.carried.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Nothing carried</div>
        ) : (
          eva.carried.map((row) => (
            <div
              key={row.resource}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
            >
              <span style={{ color: "var(--muted)" }}>
                <span style={{ color: resourceColor(row.resource) }}>● </span>
                {row.resource}
              </span>
              <span className="tabular" style={{ color: "var(--text-soft)" }}>
                {formatKg(row.quantityKg)} kg
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Scan limits mirror src/scan.ts; the server's own message wins on rejection.
export function ScanControls({
  busy,
  onScan,
}: {
  busy: boolean;
  onScan: (sensorStrength: number, radiusTiles: number) => void;
}) {
  const [strength, setStrength] = useState("60");
  const [radius, setRadius] = useState("1");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="mini-label">Strength 0–100</span>
          <input
            className="text-input tabular"
            style={{ padding: "6px 10px", fontSize: 12.5 }}
            inputMode="numeric"
            value={strength}
            disabled={busy}
            onChange={(e) => setStrength(e.target.value)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="mini-label">Radius 0–5</span>
          <input
            className="text-input tabular"
            style={{ padding: "6px 10px", fontSize: 12.5 }}
            inputMode="numeric"
            value={radius}
            disabled={busy}
            onChange={(e) => setRadius(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn-primary"
        style={{ width: "100%" }}
        disabled={busy}
        onClick={() => onScan(Number(strength), Number(radius))}
      >
        {busy ? <span className="spin" aria-label="Scanning" /> : "Scan surroundings"}
      </button>
    </div>
  );
}

export function DeployPanel({
  humans,
  modules,
  busy,
  onDeploy,
}: {
  humans: Human[];
  modules: HabitatModule[];
  busy: boolean;
  onDeploy: (human: Human, viaSuitport: HabitatModule | null) => void;
}) {
  const [humanId, setHumanId] = useState("");
  const suitport =
    modules.find((m) => m.capabilities.includes("suitport-access")) ?? null;
  const selected = humans.find((h) => h.id === humanId) ?? null;
  const needsMove =
    selected !== null && suitport !== null && selected.locationModuleId !== suitport.id;

  return (
    <div className="inner-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="mini-label">Deploy on EVA</div>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Nobody is outside. Send a crew member through the suitport to explore
        and collect.
      </div>
      <select
        className="text-input"
        style={{ padding: "8px 10px", fontSize: 13 }}
        aria-label="Crew member to deploy"
        value={humanId}
        disabled={busy}
        onChange={(e) => setHumanId(e.target.value)}
      >
        <option value="">Choose crew…</option>
        {humans.map((human) => (
          <option key={human.id} value={human.id}>
            {human.displayName}
          </option>
        ))}
      </select>
      <button
        className="btn-primary"
        disabled={busy || selected === null}
        onClick={() => {
          if (selected !== null) onDeploy(selected, needsMove ? suitport : null);
        }}
      >
        {busy ? (
          <span className="spin" aria-label="Deploying" />
        ) : needsMove ? (
          "Move to suitport & deploy"
        ) : (
          "Deploy on EVA"
        )}
      </button>
      {suitport === null && (
        <div style={{ fontSize: 11.5, color: "var(--red)" }}>
          No module with suitport access — deployment will be refused.
        </div>
      )}
    </div>
  );
}
