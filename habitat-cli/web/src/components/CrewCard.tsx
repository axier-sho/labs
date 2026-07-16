import { useEffect, useRef, useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";
import type { HabitatModule, Human } from "../api/types";
import { initials } from "../lib/format";

function MoveMenu({
  human,
  modules,
  onClose,
}: {
  human: Human;
  modules: HabitatModule[];
  onClose: () => void;
}) {
  const { moveHuman } = useDashboard();
  const ref = useRef<HTMLDivElement>(null);
  const targets = modules.filter((m) => m.id !== human.locationModuleId);

  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fade-in"
      role="menu"
      style={{
        position: "absolute",
        right: 0,
        top: "100%",
        marginTop: 4,
        zIndex: 20,
        background: "var(--card)",
        border: "1px solid var(--pill-border)",
        borderRadius: 10,
        padding: 4,
        minWidth: 170,
        maxHeight: 220,
        overflowY: "auto",
        boxShadow: "var(--shadow)",
      }}
    >
      {targets.length === 0 ? (
        <div style={{ padding: "7px 12px", fontSize: 12, color: "var(--faint)" }}>
          No other modules.
        </div>
      ) : (
        targets.map((module) => (
          <button
            key={module.id}
            role="menuitem"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 12px",
              fontSize: 12.5,
              background: "transparent",
              border: "none",
              color: "var(--text-soft)",
              cursor: "pointer",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--track)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              onClose();
              void moveHuman(human.id, module.id);
            }}
          >
            {module.displayName}
          </button>
        ))
      )}
    </div>
  );
}

function CrewRow({ human }: { human: Human }) {
  const { modules, eva, busy } = useDashboard();
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusy = Boolean(busy[`human:${human.id}`]);
  const onEva = eva?.deployed === true && eva.human?.id === human.id;
  const module = modules.find((m) => m.id === human.locationModuleId);
  const location = onEva
    ? `Outside · (${eva?.position?.x ?? 0}, ${eva?.position?.y ?? 0})`
    : (module?.displayName ?? human.locationModuleId);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "9px 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div className="avatar" aria-hidden="true">
        {initials(human.displayName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{human.displayName}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--faint)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {location}
        </div>
      </div>
      <span
        className="tag"
        style={{ color: onEva ? "var(--accent)" : "var(--faint)" }}
      >
        {onEva ? "EVA" : "Aboard"}
      </span>
      <div style={{ position: "relative" }}>
        <button
          className="pill"
          style={{ fontSize: 11, padding: "4px 10px" }}
          disabled={isBusy || onEva}
          title={onEva ? "On EVA — dock first." : `Move ${human.displayName}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {isBusy ? <span className="spin" aria-label="Working" /> : "Move"}
        </button>
        {menuOpen && (
          <MoveMenu human={human} modules={modules} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    </div>
  );
}

export function CrewCard() {
  const { humans } = useDashboard();

  return (
    <section className="card" aria-label="Crew">
      <div className="section-label" style={{ marginBottom: 12 }}>
        Crew
      </div>

      {humans.length === 0 ? (
        <div
          style={{
            padding: "10px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--faint)",
          }}
        >
          No crew aboard.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {humans.map((human) => (
            <CrewRow key={human.id} human={human} />
          ))}
        </div>
      )}
    </section>
  );
}
