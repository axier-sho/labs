import { useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { BlueprintList } from "../components/catalog/BlueprintList";
import { BlueprintDetail } from "../components/catalog/BlueprintDetail";
import { ResourceList } from "../components/catalog/ResourceList";

// Kepler reference data: blueprint catalog with construct / create-module
// actions, plus the resource-type catalog.
export function CatalogView({
  onNavigateOverview,
}: {
  onNavigateOverview: () => void;
}) {
  const { blueprints, resources, loading, error, refetch } = useCatalog();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    blueprints.find((b) => b.blueprintId === selectedId) ??
    blueprints[0] ??
    null;

  if (loading) {
    return (
      <main style={{ padding: "20px 28px 28px", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      </main>
    );
  }

  if (error !== null) {
    return (
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div className="card reveal" style={{ maxWidth: 440, padding: 32, textAlign: "center" }}>
          <div className="display" style={{ fontSize: 26, marginBottom: 10 }}>
            Kepler unreachable
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 20px" }}>{error}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn-primary" onClick={refetch}>
              Retry
            </button>
            <button className="pill" onClick={onNavigateOverview}>
              Back to overview
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div style={{ overflowX: "auto", flex: 1 }}>
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(420px, 1fr)",
          gap: 18,
          padding: "20px 28px 28px",
          alignItems: "start",
          maxWidth: 1180,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div className="reveal" style={{ animationDelay: "70ms" }}>
          <BlueprintList
            blueprints={blueprints}
            selectedId={selected?.blueprintId ?? null}
            onSelect={setSelectedId}
          />
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 18 }}
          className="reveal"
        >
          {selected !== null ? (
            <BlueprintDetail blueprint={selected} />
          ) : (
            <section className="card" style={{ textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              No blueprints in the catalog.
            </section>
          )}
          <ResourceList resources={resources} />
        </div>
      </main>
    </div>
  );
}
