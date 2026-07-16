import { useEffect, useRef, useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";
import type { HabitatModule } from "../api/types";
import { formatKw, moduleDrawKw, moduleStatus, totalDrawKw } from "../lib/power";
import { ConfirmDialog } from "./ConfirmDialog";

const STATUS_DOT: Record<string, string> = {
  online: "var(--green)",
  active: "var(--accent)",
  idle: "var(--blue)",
  damaged: "var(--red)",
  offline: "var(--faint)",
};

// The statuses `habitat module set-status` accepts (src/commands/module.ts).
const SETTABLE_STATUSES = ["online", "active", "idle", "offline", "damaged"];

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Right-hand readout: what this module contributes — draw, generation, or
// stored energy — depending on what its runtime attributes publish.
function moduleReadout(module: HabitatModule): { label: string; color: string } {
  const capacityKwh = num(module.runtimeAttributes.energyStorageKwh);
  if (capacityKwh > 0) {
    const energyKwh = num(module.runtimeAttributes.currentEnergyKwh);
    return { label: `${formatKw(energyKwh, 1)} kWh`, color: "var(--text)" };
  }
  const genKw = num(module.runtimeAttributes.powerGenerationKw);
  if (genKw > 0) {
    return { label: `+${formatKw(genKw, 1)} kW`, color: "var(--green)" };
  }
  const drawKw = moduleDrawKw(module);
  if (drawKw > 0) {
    return { label: `−${formatKw(drawKw, 1)} kW`, color: "var(--muted)" };
  }
  return { label: "—", color: "var(--faint)" };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
      <span style={{ color: "var(--faint)", flex: "none", width: 88 }}>{label}</span>
      <span style={{ color: "var(--text-soft)", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ModuleDetail({ module }: { module: HabitatModule }) {
  const condition = module.runtimeAttributes.condition;
  return (
    <div
      className="inner-panel fade-in"
      style={{
        margin: "0 0 11px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <DetailRow label="Blueprint" value={module.blueprintId} />
      <DetailRow
        label="Capabilities"
        value={module.capabilities.length > 0 ? module.capabilities.join(", ") : "none"}
      />
      <DetailRow
        label="Connected to"
        value={module.connectedTo.length > 0 ? module.connectedTo.join(", ") : "nothing"}
      />
      {typeof condition === "number" && (
        <DetailRow label="Condition" value={condition.toFixed(2)} />
      )}
    </div>
  );
}

function ModuleMenu({
  module,
  onRename,
  onDelete,
  onClose,
}: {
  module: HabitatModule;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { setModuleStatus } = useDashboard();
  const status = moduleStatus(module);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
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
  };

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
        minWidth: 150,
        boxShadow: "var(--shadow)",
      }}
    >
      {SETTABLE_STATUSES.filter((s) => s !== status).map((s) => (
        <button
          key={s}
          style={itemStyle}
          role="menuitem"
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--track)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          onClick={() => {
            onClose();
            void setModuleStatus(module.id, s);
          }}
        >
          Set {s}
        </button>
      ))}
      <button
        style={itemStyle}
        role="menuitem"
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--track)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onClick={() => {
          onClose();
          onRename();
        }}
      >
        Rename…
      </button>
      <button
        style={{ ...itemStyle, color: "var(--red)" }}
        role="menuitem"
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--track)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onClick={() => {
          onClose();
          onDelete();
        }}
      >
        Delete…
      </button>
    </div>
  );
}

function ModuleRow({
  module,
  expanded,
  onToggle,
}: {
  module: HabitatModule;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { busy, renameModule, deleteModule } = useDashboard();
  const status = moduleStatus(module);
  const readout = moduleReadout(module);
  const isBusy = Boolean(busy[`module:${module.id}`]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(module.displayName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dotClass =
    status === "active" ? "dot pulse" : status === "damaged" ? "dot halo" : "dot";

  const submitRename = () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name !== "" && name !== module.displayName) {
      void renameModule(module.id, name);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 0",
          borderBottom: expanded ? "none" : "1px solid var(--border-soft)",
        }}
      >
        <span
          className={dotClass}
          style={{ background: STATUS_DOT[status] ?? "var(--faint)" }}
          aria-hidden="true"
        />
        {renaming ? (
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 0, padding: "5px 10px", fontSize: 13 }}
            value={renameValue}
            autoFocus
            aria-label={`Rename ${module.displayName}`}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setRenameValue(module.displayName);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
              color: "inherit",
            }}
            title="Show module details"
          >
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {module.displayName}
            </div>
            <div style={{ fontSize: 11, color: "var(--faint)" }}>
              {module.id} · {status}
            </div>
          </button>
        )}
        <span
          className="tabular"
          style={{ fontSize: 12.5, color: readout.color, textAlign: "right" }}
        >
          {readout.label}
        </span>
        <div style={{ position: "relative" }}>
          <button
            className="pill"
            style={{ fontSize: 11, padding: "4px 9px" }}
            disabled={isBusy}
            aria-label={`Actions for ${module.displayName}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {isBusy ? <span className="spin" aria-label="Working" /> : "⋯"}
          </button>
          {menuOpen && (
            <ModuleMenu
              module={module}
              onClose={() => setMenuOpen(false)}
              onRename={() => {
                setRenameValue(module.displayName);
                setRenaming(true);
              }}
              onDelete={() => setConfirmingDelete(true)}
            />
          )}
        </div>
      </div>

      {expanded && <ModuleDetail module={module} />}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${module.displayName}”?`}
          confirmLabel="Delete"
          busy={isBusy}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            void deleteModule(module.id)
              .then(() => setConfirmingDelete(false))
              .catch(() => setConfirmingDelete(false));
          }}
        >
          This removes the module from the habitat. Deletion is refused while a
          crew member is inside it.
        </ConfirmDialog>
      )}
    </>
  );
}

export function ModulesCard() {
  const { modules, modulesLoaded } = useDashboard();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onlineCount = modules.filter((m) => {
    const s = moduleStatus(m);
    return s === "online" || s === "active";
  }).length;

  return (
    <section className="card" aria-label="Modules">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <span className="section-label">Modules</span>
        {modulesLoaded && modules.length > 0 && (
          <span className="tabular" style={{ fontSize: 12, color: "var(--faint)" }}>
            {modules.length} installed · {onlineCount} online ·{" "}
            {formatKw(totalDrawKw(modules), 1)} kW draw
          </span>
        )}
      </div>

      {!modulesLoaded && (
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 38 }} />
          ))}
        </div>
      )}

      {modulesLoaded && modules.length === 0 && (
        <div
          style={{
            padding: "28px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--faint)",
          }}
        >
          No modules yet.
        </div>
      )}

      {modulesLoaded && modules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {modules.map((module) => (
            <ModuleRow
              key={module.id}
              module={module}
              expanded={expandedId === module.id}
              onToggle={() =>
                setExpandedId((id) => (id === module.id ? null : module.id))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
