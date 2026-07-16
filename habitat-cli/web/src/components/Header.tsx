import { useEffect, useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";
import { formatSimTime, parseTickCount } from "../lib/power";

export type DashboardView = "overview" | "catalog";

const NAV_ITEMS: { view: DashboardView; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "catalog", label: "Catalog" },
];

const TICK_PRESETS = [
  { count: 1, label: "+1 s" },
  { count: 60, label: "+1 m" },
  { count: 600, label: "+10 m" },
  { count: 3600, label: "+1 h" },
];

// Auto-tick speeds: simulated ticks advanced per real second.
const AUTO_SPEEDS = [
  { ticksPerSecond: 1, label: "1×" },
  { ticksPerSecond: 10, label: "10×" },
  { ticksPerSecond: 60, label: "60×" },
  { ticksPerSecond: 600, label: "600×" },
];

function TickControls() {
  const { advanceTicks, busy, sessionTicks, tickFlash } = useDashboard();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(60);
  const ticksBusy = Boolean(busy.ticks);

  // Auto-tick: advance `speed` ticks once per real second. Each round is
  // scheduled only after the previous request settles, so a slow server never
  // stacks overlapping tick runs. Any failure pauses the clock.
  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    let timer: number | undefined;

    const loop = async () => {
      try {
        await advanceTicks(speed);
      } catch (err) {
        if (!cancelled) {
          setAuto(false);
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (!cancelled) timer = window.setTimeout(() => void loop(), 1000);
    };

    timer = window.setTimeout(() => void loop(), 0);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [auto, speed, advanceTicks]);

  const run = async (count: number) => {
    setError(null);
    try {
      await advanceTicks(count);
      setCustom("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitCustom = () => {
    const count = parseTickCount(custom);
    if (count === null) {
      setError("Enter a positive whole number of ticks.");
      return;
    }
    void run(count);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          position: "relative",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--faint)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Sim time · session
        </span>
        <span className="tabular" style={{ fontSize: 14, fontWeight: 600 }}>
          {formatSimTime(sessionTicks)}
        </span>
        <span aria-live="polite" style={{ position: "absolute", top: "100%", right: 0 }}>
          {tickFlash && (
            <span
              key={tickFlash.id}
              className="tick-flash tabular"
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                whiteSpace: "nowrap",
              }}
            >
              +{tickFlash.count.toLocaleString("en-US")} ticks
            </span>
          )}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          className="pill"
          style={
            auto
              ? { borderColor: "var(--accent)", color: "var(--accent)" }
              : undefined
          }
          aria-pressed={auto}
          title={
            auto
              ? "Pause the automatic clock"
              : `Advance time continuously (${speed} ticks per second)`
          }
          onClick={() => {
            setError(null);
            setAuto((on) => !on);
          }}
        >
          {auto ? "⏸ Pause" : "▶ Auto"}
        </button>
        <select
          className="text-input tabular"
          style={{ padding: "6px 8px", fontSize: 12 }}
          aria-label="Auto-tick speed (simulated ticks per real second)"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          {AUTO_SPEEDS.map((option) => (
            <option key={option.ticksPerSecond} value={option.ticksPerSecond}>
              {option.label}
            </option>
          ))}
        </select>
        {TICK_PRESETS.map((preset) => (
          <button
            key={preset.count}
            className="pill"
            disabled={ticksBusy}
            onClick={() => void run(preset.count)}
            title={`Advance ${preset.count.toLocaleString("en-US")} tick${preset.count === 1 ? "" : "s"}`}
          >
            {preset.label}
          </button>
        ))}
        <input
          className="text-input tabular"
          style={{ width: 76, padding: "6px 10px", fontSize: 12 }}
          inputMode="numeric"
          placeholder="ticks"
          aria-label="Custom tick count"
          value={custom}
          disabled={ticksBusy}
          onChange={(e) => {
            setCustom(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCustom();
          }}
        />
        <button
          className="pill"
          disabled={ticksBusy || custom.trim() === ""}
          onClick={submitCustom}
        >
          {ticksBusy ? <span className="spin" aria-label="Advancing" /> : "Go"}
        </button>
      </div>

      {error && (
        <span
          role="alert"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            fontSize: 11.5,
            color: "var(--red)",
            whiteSpace: "nowrap",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "4px 10px",
            zIndex: 10,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 24, background: "var(--border)" }} />;
}

export function Header({
  view,
  onNavigate,
  onUnregister,
}: {
  view: DashboardView;
  onNavigate: (view: DashboardView) => void;
  onUnregister: () => void;
}) {
  const { registration, status, irradiance, irradianceError } = useDashboard();
  const reachable = status?.reachable ?? false;

  return (
    <header
      className="fade-in"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 28px",
        minHeight: 64,
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
        rowGap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div className="display" style={{ fontSize: 24, letterSpacing: "0.01em" }}>
          Meridian
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--faint)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {registration ? registration.displayName : "Unregistered"}
        </div>
      </div>

      <nav style={{ display: "flex", gap: 2, marginLeft: 12 }} aria-label="Dashboard views">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            className={`nav-pill${view === item.view ? " active" : ""}`}
            aria-current={view === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--muted)",
        }}
        title={irradianceError ?? "Solar irradiance reported by Kepler"}
      >
        <span style={{ color: "var(--accent)", fontSize: 13 }} aria-hidden="true">
          ☀
        </span>
        {irradiance ? (
          <>
            <span className="tabular" style={{ color: "var(--text)" }}>
              {irradiance.wPerM2.toLocaleString("en-US")} W/m²
            </span>
            <span style={{ color: "var(--faint)" }}>{irradiance.condition}</span>
          </>
        ) : (
          <span style={{ color: "var(--faint)" }}>— · unavailable</span>
        )}
      </div>

      <Divider />

      <TickControls />

      <Divider />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: reachable ? "var(--green)" : "var(--faint)",
        }}
        title={
          reachable
            ? "The Kepler planet server is reachable"
            : (status?.error ?? "The Kepler planet server is unreachable")
        }
      >
        <span
          className="dot"
          style={{
            width: 6,
            height: 6,
            background: reachable ? "var(--green)" : "var(--faint)",
          }}
          aria-hidden="true"
        />
        {reachable ? "Kepler linked" : "Kepler offline"}
      </div>

      <Divider />

      <button className="pill" onClick={onUnregister}>
        Unregister
      </button>
    </header>
  );
}
