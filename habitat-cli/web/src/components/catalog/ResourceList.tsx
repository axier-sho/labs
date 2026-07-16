import type { ResourceCatalogEntry } from "../../api/types";
import { resourceColor } from "../../lib/resources";

export function ResourceList({ resources }: { resources: ResourceCatalogEntry[] }) {
  return (
    <section className="card" aria-label="Resource types">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <span className="section-label">Resource types</span>
        <span className="tabular" style={{ fontSize: 12, color: "var(--faint)" }}>
          {resources.length} known
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {resources.map((resource) => (
          <div
            key={resource.resourceType}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "10px 0",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <span
              style={{ color: resourceColor(resource.resourceType), fontSize: 10, flex: "none" }}
              aria-hidden="true"
            >
              ●
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {resource.displayName}
                <span style={{ fontWeight: 400, color: "var(--faint)", fontSize: 11 }}>
                  {"  "}
                  {resource.resourceType}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
                {resource.description}
              </div>
            </div>
            <span
              className="tag"
              style={{ color: "var(--faint)", flex: "none" }}
            >
              {resource.kind} · {resource.rarity} · {resource.unit}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
