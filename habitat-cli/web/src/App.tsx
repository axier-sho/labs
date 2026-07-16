import { useState } from "react";
import { DashboardProvider, useDashboard } from "./hooks/useDashboardData";
import { Header, type DashboardView } from "./components/Header";
import { Onboarding } from "./components/Onboarding";
import { OverviewView } from "./views/OverviewView";
import { CatalogView } from "./views/CatalogView";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Toasts } from "./components/Toast";

function Splash() {
  return (
    <div
      className="fade-in"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div className="display" style={{ fontSize: 34, color: "var(--text)" }}>
        Meridian
      </div>
      <span className="spin" style={{ color: "var(--accent)" }} aria-label="Loading" />
    </div>
  );
}

function BootError() {
  const { bootError, retryBoot } = useDashboard();
  return (
    <div
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
          Console offline
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 20px" }}>
          {bootError ?? "The Habitat API did not respond."}
        </p>
        <button className="btn-primary" onClick={retryBoot}>
          Retry
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const { registration, unregisterHabitat, busy } = useDashboard();
  const [confirmingUnregister, setConfirmingUnregister] = useState(false);
  const [view, setView] = useState<DashboardView>("overview");

  if (!registration) return <Onboarding />;

  return (
    <>
      <Header
        view={view}
        onNavigate={setView}
        onUnregister={() => setConfirmingUnregister(true)}
      />
      {view === "overview" ? (
        <OverviewView onNavigateCatalog={() => setView("catalog")} />
      ) : (
        <CatalogView onNavigateOverview={() => setView("overview")} />
      )}

      {confirmingUnregister && (
        <ConfirmDialog
          title={`Unregister “${registration.displayName}”?`}
          confirmLabel="Unregister"
          busy={Boolean(busy.unregister)}
          onCancel={() => setConfirmingUnregister(false)}
          onConfirm={() => {
            void unregisterHabitat()
              .then(() => setConfirmingUnregister(false))
              .catch(() => setConfirmingUnregister(false));
          }}
        >
          This removes the habitat record from the Kepler planet server and
          clears all local state — modules, crew, inventory, and alerts. It
          cannot be undone.
        </ConfirmDialog>
      )}
    </>
  );
}

function Shell() {
  const { phase } = useDashboard();
  return (
    <>
      {phase === "loading" && <Splash />}
      {phase === "error" && <BootError />}
      {phase === "ready" && <Dashboard />}
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  );
}
