import { useDashboard } from "../hooks/useDashboardData";
import {
  batteryTotals,
  formatKw,
  ratedSolarKw,
  solarAvgKw,
  totalDrawKw,
} from "../lib/power";
import { Sparkline } from "./Sparkline";

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="tabular" style={{ color: valueColor ?? "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export function PowerCard() {
  const { modules, modulesLoaded, lastTick, batteryHistory } = useDashboard();

  if (!modulesLoaded) {
    return (
      <section className="card" aria-busy="true" aria-label="Power, loading">
        <div className="section-label" style={{ marginBottom: 16 }}>
          Power
        </div>
        <div className="skeleton" style={{ height: 44, width: 140, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 6, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 13, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 13 }} />
      </section>
    );
  }

  const drawKw = totalDrawKw(modules);
  const battery = batteryTotals(modules);
  const ratedKw = ratedSolarKw(modules);
  const solarKw = lastTick ? solarAvgKw(lastTick) : null;
  const netKw = (solarKw ?? 0) - drawKw;

  const batteryPct =
    battery.capacityKwh > 0
      ? Math.max(0, Math.min(100, (battery.energyKwh / battery.capacityKwh) * 100))
      : 0;
  const reserveLow = battery.hasBattery && batteryPct < 15;

  return (
    <section className="card" aria-label="Power">
      <div className="section-label" style={{ marginBottom: 16 }}>
        Power
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="display tabular"
          style={{
            fontSize: 44,
            lineHeight: 1,
            color: netKw >= 0 ? "var(--green)" : "var(--red)",
          }}
        >
          {netKw >= 0 ? "+" : "−"}
          {formatKw(Math.abs(netKw))}
        </span>
        <span style={{ fontSize: 13, color: "var(--faint)" }}>kW net</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 20px" }}>
        {solarKw === null
          ? "Advance time to measure solar charging."
          : netKw >= 0
            ? "Charging — generation exceeds draw."
            : "Drawing from battery reserve."}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--faint)",
          }}
        >
          Battery
        </span>
        <span className="tabular" style={{ fontSize: 13 }}>
          {battery.hasBattery
            ? `${formatKw(battery.energyKwh, 1)} / ${formatKw(battery.capacityKwh, 0)} kWh`
            : "—"}
        </span>
      </div>
      <div className="track" style={{ marginBottom: reserveLow ? 8 : 20 }}>
        <div
          className={`track-fill${reserveLow ? " low" : ""}`}
          style={{ width: `${batteryPct}%` }}
        />
      </div>
      {reserveLow && (
        <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 16 }}>
          Reserve low — construction and solar-independent loads may stall.
        </div>
      )}
      {!battery.hasBattery && (
        <div style={{ fontSize: 12, color: "var(--faint)", margin: "-12px 0 16px" }}>
          No battery installed.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row label="Module draw" value={`−${formatKw(drawKw)} kW`} />
        <Row
          label="Solar charging"
          value={solarKw === null ? "—" : `+${formatKw(solarKw)} kW`}
          valueColor={solarKw === null ? "var(--faint)" : "var(--green)"}
        />
        <Row
          label="Array rated"
          value={`${formatKw(ratedKw, 1)} kW`}
          valueColor="var(--faint)"
        />
      </div>

      {lastTick?.solarSkipReason && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11.5,
            color: "var(--muted)",
            border: "1px solid var(--border-soft)",
            background: "var(--bg-inset)",
            borderRadius: 8,
            padding: "7px 10px",
          }}
        >
          Solar skipped: {lastTick.solarSkipReason}
        </div>
      )}

      <Sparkline points={batteryHistory} />

      {lastTick && (
        <div
          className="tabular"
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--border-soft)",
            fontSize: 11.5,
            color: "var(--muted)",
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 10px",
          }}
        >
          <span style={{ color: "var(--text-soft)", fontWeight: 600 }}>
            Last advance
          </span>
          <span>+{lastTick.ticks.toLocaleString("en-US")} ticks</span>
          <span>−{formatKw(lastTick.energyConsumedKwh)} kWh used</span>
          <span style={{ color: lastTick.solarGeneratedKwh > 0 ? "var(--green)" : undefined }}>
            +{formatKw(lastTick.solarGeneratedKwh)} kWh solar
          </span>
        </div>
      )}
    </section>
  );
}
