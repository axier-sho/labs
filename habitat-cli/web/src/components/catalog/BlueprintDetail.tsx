import { useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ConstructionEvaluation, ProductionBlueprint } from "../../api/types";
import { useDashboard } from "../../hooks/useDashboardData";
import { formatKg } from "../../lib/format";
import { resourceColor } from "../../lib/resources";

// Mirrors src/construction.ts toResourceMap: blueprint inputs are a
// resource → positive-number map; anything else is ignored.
function requiredResourcesOf(blueprint: ProductionBlueprint): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [resource, value] of Object.entries(blueprint.inputs)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      map[resource] = value;
    }
  }
  return map;
}

function requiredFacilityOf(blueprint: ProductionBlueprint): string | null {
  const moduleType = blueprint.requiredFacility?.moduleType;
  return typeof moduleType === "string" ? moduleType : null;
}

function ChecksPanel({ evaluation }: { evaluation: ConstructionEvaluation }) {
  return (
    <div className="inner-panel fade-in" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div className="mini-label" style={{ marginBottom: 2 }}>
        Readiness — {evaluation.canStart ? "can start" : "cannot start"}
      </div>
      {evaluation.checks.map((check) => (
        <div key={check.label} style={{ display: "flex", gap: 8, fontSize: 12 }}>
          <span
            style={{ color: check.ok ? "var(--green)" : "var(--red)", flex: "none" }}
            aria-hidden="true"
          >
            {check.ok ? "✓" : "✕"}
          </span>
          <span style={{ color: "var(--text-soft)" }}>
            <span style={{ fontWeight: 600 }}>{check.label}</span>
            {check.detail !== "" && (
              <span style={{ color: "var(--muted)" }}> — {check.detail}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BlueprintDetail({ blueprint }: { blueprint: ProductionBlueprint }) {
  const { inventory, startConstruction, createModule, busy } = useDashboard();
  const [evaluation, setEvaluation] = useState<ConstructionEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [moduleName, setModuleName] = useState("");

  // A different blueprint invalidates the previous dry-run.
  useEffect(() => {
    setEvaluation(null);
    setEvalError(null);
    setModuleName("");
  }, [blueprint.blueprintId]);

  const required = requiredResourcesOf(blueprint);
  const facility = requiredFacilityOf(blueprint);
  const stockOf = (resource: string) =>
    inventory.find((entry) => entry.resource === resource)?.quantity ?? 0;

  const runDryRun = async () => {
    setEvaluating(true);
    setEvalError(null);
    try {
      const result = await api.evaluateConstruction(blueprint.blueprintId);
      setEvaluation(result.evaluation);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : String(error));
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <section className="card" aria-label={`Blueprint ${blueprint.displayName}`}>
      <div className="section-label" style={{ marginBottom: 12 }}>
        Blueprint detail
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span className="display" style={{ fontSize: 24 }}>
          {blueprint.displayName}
        </span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>{blueprint.blueprintId}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 14px" }}>
        {blueprint.description}
      </p>

      <div
        className="tabular"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 14,
        }}
      >
        <span>{blueprint.buildTicks.toLocaleString("en-US")} build ticks</span>
        <span>{blueprint.repeatable ? "repeatable" : "one-time"}</span>
        {facility !== null && <span>requires {facility}</span>}
        {blueprint.capabilities.length > 0 && (
          <span>{blueprint.capabilities.join(", ")}</span>
        )}
      </div>

      <div className="inner-panel" style={{ marginBottom: 14 }}>
        <div className="mini-label" style={{ marginBottom: 8 }}>
          Required resources
        </div>
        {Object.keys(required).length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>None.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(required).map(([resource, needed]) => {
              const stock = stockOf(resource);
              const enough = stock >= needed;
              return (
                <div
                  key={resource}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}
                >
                  <span style={{ color: "var(--text-soft)" }}>
                    <span style={{ color: resourceColor(resource) }}>● </span>
                    {resource}
                  </span>
                  <span
                    className="tabular"
                    style={{ color: enough ? "var(--green)" : "var(--red)" }}
                  >
                    {formatKg(stock)} / {formatKg(needed)} kg
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {evaluation !== null && <ChecksPanel evaluation={evaluation} />}
      {evalError !== null && (
        <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>
          {evalError}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn-outline" disabled={evaluating} onClick={() => void runDryRun()}>
          {evaluating ? <span className="spin" aria-label="Evaluating" /> : "Check readiness"}
        </button>
        <button
          className="btn-primary"
          disabled={Boolean(busy["construction:start"])}
          title="The server re-validates readiness before starting."
          onClick={() => {
            void startConstruction(blueprint.blueprintId)
              .then(() => void runDryRun())
              .catch(() => {
                // The provider already toasts the reason.
              });
          }}
        >
          {busy["construction:start"] ? (
            <span className="spin" aria-label="Starting" />
          ) : (
            "Start construction"
          )}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border-soft)",
          alignItems: "center",
        }}
      >
        <input
          className="text-input"
          style={{ flex: 1, minWidth: 0, padding: "8px 10px", fontSize: 12.5 }}
          placeholder="display name (optional)"
          aria-label="Display name for the new module"
          value={moduleName}
          onChange={(e) => setModuleName(e.target.value)}
        />
        <button
          className="pill"
          disabled={Boolean(busy["module:create"])}
          title="Create the module directly, without a construction job"
          onClick={() => {
            const name = moduleName.trim();
            void createModule(blueprint.blueprintId, name === "" ? undefined : name)
              .then(() => setModuleName(""))
              .catch(() => {
                // The provider already toasts the reason.
              });
          }}
        >
          {busy["module:create"] ? (
            <span className="spin" aria-label="Creating" />
          ) : (
            "Create module"
          )}
        </button>
      </div>
    </section>
  );
}
