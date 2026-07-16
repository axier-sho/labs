import { PowerCard } from "../components/PowerCard";
import { ModulesCard } from "../components/ModulesCard";
import { SurfaceOpsCard } from "../components/surface/SurfaceOpsCard";
import { AlertsCard } from "../components/AlertsCard";
import { ConstructionCard } from "../components/ConstructionCard";
import { InventoryCard } from "../components/InventoryCard";
import { CrewCard } from "../components/CrewCard";

// The designed Overview screen: power + modules on the left, surface
// operations in the center, alerts/construction/inventory/crew on the right.
// The grid keeps its designed width and scrolls horizontally below 1240px.
export function OverviewView({
  onNavigateCatalog,
}: {
  onNavigateCatalog?: () => void;
}) {
  return (
    <div style={{ overflowX: "auto", flex: 1 }}>
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "300px minmax(500px, 1fr) 320px",
          gap: 18,
          padding: "20px 28px 28px",
          alignItems: "start",
          minWidth: 1240,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="reveal" style={{ animationDelay: "70ms" }}>
            <PowerCard />
          </div>
          <div className="reveal" style={{ animationDelay: "140ms" }}>
            <ModulesCard />
          </div>
        </div>

        <div className="reveal" style={{ animationDelay: "100ms" }}>
          <SurfaceOpsCard />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="reveal" style={{ animationDelay: "130ms" }}>
            <AlertsCard />
          </div>
          <div className="reveal" style={{ animationDelay: "180ms" }}>
            <ConstructionCard onNavigateCatalog={onNavigateCatalog} />
          </div>
          <div className="reveal" style={{ animationDelay: "230ms" }}>
            <InventoryCard />
          </div>
          <div className="reveal" style={{ animationDelay: "280ms" }}>
            <CrewCard />
          </div>
        </div>
      </main>
    </div>
  );
}
