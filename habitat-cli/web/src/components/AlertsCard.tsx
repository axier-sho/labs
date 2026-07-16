import { useDashboard } from "../hooks/useDashboardData";
import type { Alert } from "../api/types";
import { relativeAge } from "../lib/format";

const SEVERITY_COLOR: Record<Alert["severity"], string> = {
  critical: "var(--critical)",
  warning: "var(--warning)",
  info: "var(--info)",
};

function AlertRow({ alert }: { alert: Alert }) {
  const { acknowledgeAlert, busy } = useDashboard();
  const isBusy = Boolean(busy[`alert:${alert.id}`]);
  const settled = alert.status !== "open";

  const meta = [
    alert.code,
    relativeAge(alert.lastObservedAt),
    ...(alert.occurrenceCount > 1 ? [`×${alert.occurrenceCount}`] : []),
    ...(alert.status === "acknowledged" ? ["acknowledged"] : []),
    ...(alert.status === "resolved" ? ["resolved"] : []),
  ].join(" · ");

  return (
    <div
      className="inner-panel"
      style={{ padding: "12px 14px", opacity: settled ? 0.55 : 1 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          className={alert.severity === "critical" ? "dot halo" : "dot"}
          style={{ width: 6, height: 6, background: SEVERITY_COLOR[alert.severity] }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{alert.title}</span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.45,
          marginBottom: 8,
        }}
      >
        {alert.description}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{ fontSize: 10.5, color: "var(--faint)", letterSpacing: "0.06em" }}
        >
          {meta}
        </span>
        {alert.status === "open" && (
          <button
            className="pill"
            style={{ fontSize: 11, padding: "4px 10px" }}
            disabled={isBusy}
            onClick={() => void acknowledgeAlert(alert.id)}
          >
            {isBusy ? <span className="spin" aria-label="Working" /> : "Acknowledge"}
          </button>
        )}
      </div>
    </div>
  );
}

export function AlertsCard() {
  const { alerts } = useDashboard();
  const openCount = alerts.filter((a) => a.status === "open").length;

  return (
    <section className="card" aria-label="Alerts">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <span className="section-label">Alerts</span>
        <span
          className="tabular"
          style={{
            fontSize: 12,
            color: openCount > 0 ? "var(--accent)" : "var(--faint)",
          }}
        >
          {openCount} open
        </span>
      </div>

      {alerts.length === 0 ? (
        <div
          style={{
            padding: "18px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--faint)",
          }}
        >
          No alerts — all quiet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
