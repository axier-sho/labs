import { useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";
import type { ActiveConstruction } from "../api/types";
import { ConfirmDialog } from "./ConfirmDialog";

function JobRow({ construction }: { construction: ActiveConstruction }) {
  const { cancelConstruction, busy } = useDashboard();
  const [confirming, setConfirming] = useState(false);
  const { facilityId, facilityName, job } = construction;
  const isBusy = Boolean(busy[`construction:${facilityId}`]);
  const pct =
    job.buildTicks > 0
      ? Math.round((1 - job.remainingTicks / job.buildTicks) * 100)
      : 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{facilityName}</span>
        <span
          className="display tabular"
          style={{ fontSize: 20, color: "var(--accent)" }}
        >
          {pct}%
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 10 }}>
        {job.blueprintId} · {job.remainingTicks.toLocaleString("en-US")} ticks
        remaining
      </div>
      <div className="track" style={{ height: 5 }}>
        <div className="track-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          className="pill"
          style={{ fontSize: 11, padding: "4px 10px" }}
          disabled={isBusy}
          onClick={() => setConfirming(true)}
        >
          {isBusy ? <span className="spin" aria-label="Working" /> : "Cancel"}
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Cancel construction on ${facilityName}?`}
          confirmLabel="Cancel job"
          busy={isBusy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void cancelConstruction(facilityId).then(() => setConfirming(false));
          }}
        >
          The job stops immediately and spent materials are not refunded.
        </ConfirmDialog>
      )}
    </div>
  );
}

export function ConstructionCard({
  onNavigateCatalog,
}: {
  onNavigateCatalog?: () => void;
}) {
  const { constructions } = useDashboard();

  return (
    <section className="card" aria-label="Construction">
      <div className="section-label" style={{ marginBottom: 14 }}>
        Construction
      </div>

      {constructions.length === 0 ? (
        <div
          style={{
            padding: "8px 0 4px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--faint)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
          }}
        >
          Nothing under construction.
          {onNavigateCatalog && (
            <button className="pill" onClick={onNavigateCatalog}>
              Browse blueprints
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {constructions.map((c) => (
            <JobRow key={c.facilityId} construction={c} />
          ))}
        </div>
      )}
    </section>
  );
}
