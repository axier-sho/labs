import { useState } from "react";
import * as api from "../../api/client";
import type { HabitatModule, Human } from "../../api/types";
import { useDashboard } from "../../hooks/useDashboardData";
import { tileKey, useEvaMap } from "../../hooks/useEvaMap";
import { formatKg } from "../../lib/format";
import { TileGrid } from "./TileGrid";
import {
  CarriedLoadPanel,
  DeployPanel,
  PositionPanel,
  ScanControls,
  TileSurveyPanel,
} from "./EvaPanels";

type Hint = { text: string; tone: "info" | "error" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SurfaceOpsCard() {
  const {
    registration,
    eva,
    humans,
    modules,
    busy,
    deployEva,
    moveExplorer,
    collectFromTile,
    dockExplorer,
    moveHuman,
    pushToast,
  } = useDashboard();
  const { known, recordScan } = useEvaMap(registration?.habitatId ?? null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [scanning, setScanning] = useState(false);
  const [collectQty, setCollectQty] = useState("5");
  const evaBusy = Boolean(busy.eva);
  const deployed = eva?.deployed === true;
  const position = deployed ? (eva?.position ?? null) : null;

  const info = (text: string) => setHint({ text, tone: "info" });
  const fail = (text: string) => setHint({ text, tone: "error" });

  const handleMove = async (x: number, y: number) => {
    try {
      await moveExplorer(x, y);
      setHint(null);
    } catch (error) {
      fail(errorMessage(error));
    }
  };

  const handleScan = async (sensorStrength: number, radiusTiles: number) => {
    setScanning(true);
    try {
      const { scan } = await api.scanWorld(sensorStrength, radiusTiles);
      recordScan(scan);
      info(
        `Scan complete — radius ${scan.radiusTiles} around (${scan.origin.x}, ${scan.origin.y}).`,
      );
    } catch (error) {
      fail(errorMessage(error));
    } finally {
      setScanning(false);
    }
  };

  const handleCollect = async () => {
    const qty = Number(collectQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      fail("Quantity must be a positive whole number of kilograms.");
      return;
    }
    try {
      info(await collectFromTile(qty));
    } catch (error) {
      fail(errorMessage(error));
    }
  };

  const handleDock = async () => {
    try {
      const unloaded = await dockExplorer();
      const summary =
        unloaded.length === 0
          ? "nothing carried"
          : unloaded
              .map((r) => `${formatKg(r.quantityKg)} kg ${r.resource}`)
              .join(", ");
      info("Docked — carried material moved to inventory.");
      pushToast(`Docked & unloaded: ${summary}.`);
    } catch (error) {
      fail(errorMessage(error));
    }
  };

  // Deploy requires the human to already be in the suitport module; when they
  // are elsewhere this chains the move first, like the CLI suggests doing.
  const handleDeploy = async (human: Human, viaSuitport: HabitatModule | null) => {
    try {
      if (viaSuitport !== null) {
        await moveHuman(human.id, viaSuitport.id);
      }
      await deployEva(human.id);
      info(`${human.displayName} is outside at (0, 0).`);
    } catch (error) {
      fail(errorMessage(error));
    }
  };

  const currentEntry =
    position === null ? undefined : known[tileKey(position.x, position.y)];
  const atHabitat = position !== null && position.x === 0 && position.y === 0;

  return (
    <section
      className="card"
      aria-label="Surface operations"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div className="section-label">Surface operations</div>
        {deployed && eva?.human !== null && eva?.human !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span className="dot" style={{ width: 6, height: 6, background: "var(--accent)" }} />
            <span style={{ fontWeight: 600 }}>{eva.human.displayName}</span>
            <span style={{ color: "var(--faint)" }}>
              outside via {eva.suitportModuleId}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <TileGrid
          known={known}
          explorer={position}
          disabled={evaBusy}
          onMove={(x, y) => void handleMove(x, y)}
        />

        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {!deployed || eva === null ? (
            <DeployPanel
              humans={humans}
              modules={modules}
              busy={evaBusy}
              onDeploy={(human, suitport) => void handleDeploy(human, suitport)}
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <PositionPanel eva={eva} />
                <TileSurveyPanel entry={currentEntry} />
              </div>

              <CarriedLoadPanel eva={eva} />

              <ScanControls busy={scanning || evaBusy} onScan={(s, r) => void handleScan(s, r)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="text-input tabular"
                    style={{ width: 52, padding: "6px 8px", fontSize: 12.5 }}
                    inputMode="numeric"
                    aria-label="Kilograms to collect"
                    value={collectQty}
                    disabled={evaBusy}
                    onChange={(e) => setCollectQty(e.target.value)}
                  />
                  <button
                    className="btn-outline"
                    style={{ flex: 1, padding: "8px 8px", fontSize: 12.5 }}
                    disabled={evaBusy}
                    onClick={() => void handleCollect()}
                  >
                    Collect kg
                  </button>
                </div>
                <button
                  className="btn-outline"
                  style={{ fontSize: 12.5 }}
                  disabled={evaBusy}
                  title={
                    atHabitat
                      ? "Dock and unload carried material"
                      : "Docking is only possible at (0, 0) — walk back first."
                  }
                  onClick={() => void handleDock()}
                >
                  Dock &amp; unload
                </button>
              </div>
            </>
          )}

          <div
            role="status"
            style={{
              fontSize: 11.5,
              color: hint?.tone === "error" ? "var(--red)" : "var(--faint)",
              textAlign: "center",
              minHeight: 16,
            }}
          >
            {hint?.text ?? ""}
          </div>
        </div>
      </div>
    </section>
  );
}
