import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { formatKg } from "../lib/format";
import type {
  ActiveConstruction,
  Alert,
  CarriedResource,
  EvaStatus,
  HabitatModule,
  Human,
  InventoryEntry,
  Registration,
  SolarIrradiance,
  StatusResponse,
  TickSummary,
} from "../api/types";

export type BatteryPoint = {
  sessionTick: number;
  energyKwh: number;
  capacityKwh: number;
};

export type Toast = { id: number; message: string };

type DashboardState = {
  phase: "loading" | "error" | "ready";
  bootError: string | null;
  registration: Registration | null;
  status: StatusResponse | null;
  modules: HabitatModule[];
  modulesLoaded: boolean;
  irradiance: SolarIrradiance | null;
  irradianceError: string | null;
  lastTick: TickSummary | null;
  sessionTicks: number;
  batteryHistory: BatteryPoint[];
  tickFlash: { id: number; count: number } | null;
  toasts: Toast[];
  busy: Record<string, boolean>;
  humans: Human[];
  alerts: Alert[];
  inventory: InventoryEntry[];
  eva: EvaStatus | null;
  constructions: ActiveConstruction[];
};

type DashboardApi = DashboardState & {
  retryBoot: () => void;
  registerHabitat: (name: string) => Promise<void>;
  unregisterHabitat: () => Promise<void>;
  setModuleStatus: (id: string, status: string) => Promise<void>;
  renameModule: (id: string, displayName: string) => Promise<void>;
  createModule: (blueprintId: string, displayName?: string) => Promise<void>;
  deleteModule: (id: string) => Promise<void>;
  advanceTicks: (count: number) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
  moveHuman: (id: string, locationModuleId: string) => Promise<void>;
  addInventoryEntry: (resource: string, quantity: number) => Promise<void>;
  startConstruction: (blueprintId: string) => Promise<void>;
  cancelConstruction: (facilityId: string) => Promise<void>;
  // EVA actions rethrow validation errors so Surface Operations can render
  // them in its hint line instead of a toast.
  deployEva: (humanId: string) => Promise<void>;
  moveExplorer: (x: number, y: number) => Promise<void>;
  collectFromTile: (quantityKg: number) => Promise<string>;
  dockExplorer: () => Promise<CarriedResource[]>;
  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const DashboardContext = createContext<DashboardApi | null>(null);

const POLL_INTERVAL_MS = 30_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The scanned-tile map (useEvaMap) is remembered per habitat in localStorage.
// A registration change makes that knowledge stale, so it is dropped here.
function clearScanCache(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith("meridian-scan:")) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState>({
    phase: "loading",
    bootError: null,
    registration: null,
    status: null,
    modules: [],
    modulesLoaded: false,
    irradiance: null,
    irradianceError: null,
    lastTick: null,
    sessionTicks: 0,
    batteryHistory: [],
    tickFlash: null,
    toasts: [],
    busy: {},
    humans: [],
    alerts: [],
    inventory: [],
    eva: null,
    constructions: [],
  });
  const nextId = useRef(1);

  const pushToast = useCallback((message: string) => {
    const id = nextId.current++;
    setState((s) => ({ ...s, toasts: [...s.toasts, { id, message }] }));
    window.setTimeout(() => {
      setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
  }, []);

  const setBusy = useCallback((key: string, value: boolean) => {
    setState((s) => ({ ...s, busy: { ...s.busy, [key]: value } }));
  }, []);

  // Refetches everything the dashboard shows. Registration is the one call
  // that must succeed; the rest degrade per-section.
  const refetchAll = useCallback(async (options?: { boot?: boolean }) => {
    const [
      registration,
      status,
      modules,
      irradiance,
      humans,
      alerts,
      inventory,
      eva,
      constructions,
    ] = await Promise.allSettled([
      api.getRegistration(),
      api.getStatus(),
      api.getModules(),
      api.getSolarIrradiance(),
      api.getHumans(),
      api.getAlerts(),
      api.getInventory(),
      api.getEva(),
      api.getConstruction(),
    ]);

    setState((s) => {
      if (registration.status === "rejected") {
        return options?.boot
          ? { ...s, phase: "error", bootError: errorMessage(registration.reason) }
          : s;
      }
      return {
        ...s,
        phase: "ready",
        bootError: null,
        registration: registration.value.registration,
        status: status.status === "fulfilled" ? status.value : s.status,
        modules:
          modules.status === "fulfilled" ? modules.value.modules : s.modules,
        modulesLoaded: s.modulesLoaded || modules.status === "fulfilled",
        irradiance:
          irradiance.status === "fulfilled"
            ? irradiance.value.solarIrradiance
            : null,
        irradianceError:
          irradiance.status === "rejected"
            ? errorMessage(irradiance.reason)
            : null,
        humans: humans.status === "fulfilled" ? humans.value.humans : s.humans,
        alerts: alerts.status === "fulfilled" ? alerts.value.alerts : s.alerts,
        inventory:
          inventory.status === "fulfilled"
            ? inventory.value.inventory
            : s.inventory,
        eva: eva.status === "fulfilled" ? eva.value.eva : s.eva,
        constructions:
          constructions.status === "fulfilled"
            ? constructions.value.active
            : s.constructions,
      };
    });
  }, []);

  const retryBoot = useCallback(() => {
    setState((s) => ({ ...s, phase: "loading", bootError: null }));
    void refetchAll({ boot: true });
  }, [refetchAll]);

  useEffect(() => {
    void refetchAll({ boot: true });
  }, [refetchAll]);

  // Light poll keeps the Kepler link dot and solar readout honest without
  // hammering the local server. Alerts and construction ride along so a
  // concurrent CLI session's changes still show up.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void Promise.allSettled([
        api.getStatus(),
        api.getSolarIrradiance(),
        api.getAlerts(),
        api.getConstruction(),
      ]).then(([status, irradiance, alerts, constructions]) => {
        setState((s) => {
          if (s.phase !== "ready") return s;
          return {
            ...s,
            status: status.status === "fulfilled" ? status.value : s.status,
            irradiance:
              irradiance.status === "fulfilled"
                ? irradiance.value.solarIrradiance
                : null,
            irradianceError:
              irradiance.status === "rejected"
                ? errorMessage(irradiance.reason)
                : null,
            alerts:
              alerts.status === "fulfilled" ? alerts.value.alerts : s.alerts,
            constructions:
              constructions.status === "fulfilled"
                ? constructions.value.active
                : s.constructions,
          };
        });
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const registerHabitat = useCallback(
    async (name: string) => {
      setBusy("register", true);
      try {
        await api.register(name);
        clearScanCache();
        setState((s) => ({
          ...s,
          sessionTicks: 0,
          lastTick: null,
          batteryHistory: [],
        }));
        await refetchAll();
      } finally {
        setBusy("register", false);
      }
    },
    [refetchAll, setBusy],
  );

  const unregisterHabitat = useCallback(async () => {
    setBusy("unregister", true);
    try {
      await api.unregister();
      clearScanCache();
      setState((s) => ({
        ...s,
        sessionTicks: 0,
        lastTick: null,
        batteryHistory: [],
      }));
      await refetchAll();
    } catch (error) {
      pushToast(errorMessage(error));
      throw error;
    } finally {
      setBusy("unregister", false);
    }
  }, [pushToast, refetchAll, setBusy]);

  const setModuleStatus = useCallback(
    async (id: string, status: string) => {
      setBusy(`module:${id}`, true);
      try {
        await api.patchModuleStatus(id, status);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        await refetchAll();
      } finally {
        setBusy(`module:${id}`, false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const renameModule = useCallback(
    async (id: string, displayName: string) => {
      setBusy(`module:${id}`, true);
      try {
        await api.patchModule(id, { displayName });
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        await refetchAll();
      } finally {
        setBusy(`module:${id}`, false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const createModule = useCallback(
    async (blueprintId: string, displayName?: string) => {
      setBusy("module:create", true);
      try {
        const { module } = await api.createModule(blueprintId, displayName);
        pushToast(`Module “${module.displayName}” created.`);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        throw error;
      } finally {
        setBusy("module:create", false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const deleteModule = useCallback(
    async (id: string) => {
      setBusy(`module:${id}`, true);
      try {
        const { module } = await api.deleteModule(id);
        pushToast(`Module “${module.displayName}” deleted.`);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        await refetchAll();
        throw error;
      } finally {
        setBusy(`module:${id}`, false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const acknowledgeAlert = useCallback(
    async (id: string) => {
      setBusy(`alert:${id}`, true);
      try {
        const { alert } = await api.acknowledgeAlert(id);
        // Patch in place for immediate feedback; the next poll reconciles.
        setState((s) => ({
          ...s,
          alerts: s.alerts.map((a) => (a.id === alert.id ? alert : a)),
        }));
      } catch (error) {
        pushToast(errorMessage(error));
      } finally {
        setBusy(`alert:${id}`, false);
      }
    },
    [pushToast, setBusy],
  );

  const moveHuman = useCallback(
    async (id: string, locationModuleId: string) => {
      setBusy(`human:${id}`, true);
      try {
        await api.moveHuman(id, locationModuleId);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        await refetchAll();
      } finally {
        setBusy(`human:${id}`, false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const addInventoryEntry = useCallback(
    async (resource: string, quantity: number) => {
      setBusy("inventory:add", true);
      try {
        const { entry } = await api.addInventory(resource, quantity);
        pushToast(`Inventory: ${entry.resource} now ${entry.quantity} kg.`);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        throw error;
      } finally {
        setBusy("inventory:add", false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const startConstruction = useCallback(
    async (blueprintId: string) => {
      setBusy("construction:start", true);
      try {
        const result = await api.startConstruction(blueprintId);
        pushToast(`Construction started on ${result.facilityId}.`);
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        throw error;
      } finally {
        setBusy("construction:start", false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const cancelConstruction = useCallback(
    async (facilityId: string) => {
      setBusy(`construction:${facilityId}`, true);
      try {
        await api.cancelConstruction(facilityId);
        pushToast("Construction canceled.");
        await refetchAll();
      } catch (error) {
        pushToast(errorMessage(error));
        await refetchAll();
      } finally {
        setBusy(`construction:${facilityId}`, false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  // --- EVA actions -----------------------------------------------------
  // These rethrow so Surface Operations can put validation messages in its
  // hint line, matching the CLI's inline error style.

  const deployEva = useCallback(
    async (humanId: string) => {
      setBusy("eva", true);
      try {
        const { eva } = await api.deployEva(humanId);
        setState((s) => ({ ...s, eva }));
        await refetchAll();
      } finally {
        setBusy("eva", false);
      }
    },
    [refetchAll, setBusy],
  );

  const moveExplorer = useCallback(
    async (x: number, y: number) => {
      setBusy("eva", true);
      try {
        const { eva } = await api.moveEva(x, y);
        setState((s) => ({ ...s, eva }));
      } finally {
        setBusy("eva", false);
      }
    },
    [setBusy],
  );

  const collectFromTile = useCallback(
    async (quantityKg: number) => {
      setBusy("eva", true);
      try {
        const result = await api.collectEva(quantityKg);
        setState((s) => ({ ...s, eva: result.status }));
        // A refused collection raises an alert server-side; refresh so it shows.
        await refetchAll();
        return `Collected ${formatKg(result.collectedKg)} kg ${result.resourceType}.`;
      } finally {
        setBusy("eva", false);
      }
    },
    [refetchAll, setBusy],
  );

  const dockExplorer = useCallback(async () => {
    setBusy("eva", true);
    try {
      const result = await api.dockEva();
      setState((s) => ({ ...s, eva: result.status }));
      await refetchAll();
      return result.unloaded;
    } finally {
      setBusy("eva", false);
    }
  }, [refetchAll, setBusy]);

  const advanceTicks = useCallback(
    async (count: number) => {
      setBusy("ticks", true);
      try {
        const { summary } = await api.postTicks(count);
        if (summary.completions.length > 0) {
          pushToast(
            `Construction complete — ${summary.completions.length} module${
              summary.completions.length === 1 ? "" : "s"
            } online.`,
          );
        }
        const flashId = nextId.current++;
        setState((s) => {
          const sessionTicks = s.sessionTicks + summary.ticks;
          const batteryHistory = summary.hasBattery
            ? [
                ...s.batteryHistory,
                {
                  sessionTick: sessionTicks,
                  energyKwh: summary.batteryEnergyKwh,
                  capacityKwh: summary.batteryCapacityKwh,
                },
              ].slice(-120)
            : s.batteryHistory;
          return {
            ...s,
            lastTick: summary,
            sessionTicks,
            batteryHistory,
            tickFlash: { id: flashId, count: summary.ticks },
          };
        });
        await refetchAll();
      } finally {
        setBusy("ticks", false);
      }
    },
    [pushToast, refetchAll, setBusy],
  );

  const value = useMemo<DashboardApi>(
    () => ({
      ...state,
      retryBoot,
      registerHabitat,
      unregisterHabitat,
      setModuleStatus,
      renameModule,
      createModule,
      deleteModule,
      advanceTicks,
      acknowledgeAlert,
      moveHuman,
      addInventoryEntry,
      startConstruction,
      cancelConstruction,
      deployEva,
      moveExplorer,
      collectFromTile,
      dockExplorer,
      pushToast,
      dismissToast,
    }),
    [
      state,
      retryBoot,
      registerHabitat,
      unregisterHabitat,
      setModuleStatus,
      renameModule,
      createModule,
      deleteModule,
      advanceTicks,
      acknowledgeAlert,
      moveHuman,
      addInventoryEntry,
      startConstruction,
      cancelConstruction,
      deployEva,
      moveExplorer,
      collectFromTile,
      dockExplorer,
      pushToast,
      dismissToast,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardApi {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return context;
}

export { ApiError };
