import { useCallback, useEffect, useState } from "react";
import type { WorldScan, WorldScanTile } from "../api/types";

// The server deliberately persists no scan knowledge — a scan is an estimate,
// not truth (src/scan.ts). The dashboard remembers what its scans reported so
// the surface map can stay painted across reloads. Knowledge is keyed by
// habitat so a re-registered habitat starts blank (the provider clears
// `meridian-scan:*` keys on register/unregister).

export type KnownTile = {
  tile: WorldScanTile;
  scannedAt: string;
  sensorStrength: number;
};

export type EvaMapState = Record<string, KnownTile>;

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function storageKey(habitatId: string): string {
  return `meridian-scan:${habitatId}`;
}

function loadKnown(habitatId: string | null): EvaMapState {
  if (habitatId === null) return {};
  try {
    const raw = localStorage.getItem(storageKey(habitatId));
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as EvaMapState)
      : {};
  } catch {
    return {};
  }
}

export function useEvaMap(habitatId: string | null): {
  known: EvaMapState;
  recordScan: (scan: WorldScan) => void;
} {
  const [known, setKnown] = useState<EvaMapState>(() => loadKnown(habitatId));

  // Reload when the habitat identity changes (register/unregister).
  useEffect(() => {
    setKnown(loadKnown(habitatId));
  }, [habitatId]);

  useEffect(() => {
    if (habitatId === null) return;
    try {
      localStorage.setItem(storageKey(habitatId), JSON.stringify(known));
    } catch {
      // Storage unavailable — the map simply will not survive a reload.
    }
  }, [habitatId, known]);

  // Merge every tile from a scan; the newest estimate wins.
  const recordScan = useCallback((scan: WorldScan) => {
    const scannedAt = new Date().toISOString();
    setKnown((current) => {
      const next = { ...current };
      for (const tile of scan.tiles) {
        next[tileKey(tile.x, tile.y)] = {
          tile,
          scannedAt,
          sensorStrength: scan.sensorStrength,
        };
      }
      return next;
    });
  }, []);

  return { known, recordScan };
}
