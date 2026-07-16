import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  isListening,
  readClockState,
  type ClockState,
} from "../clock/state";
import {
  getKeplerStream,
  type ClockEvent,
} from "../clock/kepler-stream";
import {
  fetchBlueprintCatalog,
  fetchHabitatStatus,
  fetchResourceCatalog,
  fetchSolarIrradiance,
  readRegistration,
  registerHabitat,
  unregisterHabitat,
  writeRegistrationSync,
} from "../kepler";
import { showBlueprint } from "../catalog";
import {
  clearBlueprintCatalog,
  createHabitatModule,
  deleteHabitatModule,
  getHabitatModule,
  listHabitatModules,
  updateHabitatModule,
} from "../modules";
import { clearHydratedState, hydrateRegistration } from "../hydration";
import { AlertValidationError, acknowledgeAlert, listAlerts } from "../alerts";
import {
  HumanValidationError,
  listHumans,
  moveHuman,
  requireModuleUnoccupied,
} from "../humans";
import { addInventory, listInventory } from "../inventory";
import { runPowerTicks } from "../tick";
import {
  cancelConstruction,
  evaluateConstruction,
  listActiveConstructions,
  startConstruction,
} from "../construction";
import { ScanValidationError, requestWorldScan } from "../scan";
import {
  EvaValidationError,
  collectMaterial,
  deployHuman,
  dockExplorer,
  getEvaStatus,
  moveExplorer,
} from "../eva";

// The Hono backend is the REST boundary the CLI talks to. It — not the CLI —
// owns the local SQLite state and all Kepler transport. This keeps the CLI
// portable: point HABITAT_API_BASE_URL at a different host and the same CLI
// keeps working.
//
// Routes return JSON, never terminal-formatted text. Human-friendly formatting
// stays on the CLI side.
// The JSON shape returned by both clock routes. `manualTicksAllowed` is derived
// from `listening` here so the CLI and any agent read one authoritative answer
// instead of re-deriving the rule.
function clockStatusBody(state: ClockState) {
  return {
    mode: state.mode,
    listening: state.listening,
    manualTicksAllowed: !state.listening,
    connectionStatus: state.connectionStatus,
    lastTick: state.lastTick,
    lastAdvancedBy: state.lastAdvancedBy,
    lastConnectedAt: state.lastConnectedAt,
    lastMessageAt: state.lastMessageAt,
    lastError: state.lastError,
    updatedAt: state.updatedAt,
  };
}

export function createApp() {
  const app = new Hono();

  // GET /registration -> the local registration record, or null if this
  // habitat has not registered yet.
  app.get("/registration", async (c) => {
    const registration = await readRegistration();
    console.log(
      `[habitat-api] GET /registration -> ${
        registration === null ? "not registered" : "registered"
      }`,
    );
    return c.json({ registration });
  });

  // POST /registration { name } -> register with Kepler, persist to SQLite, and
  // hydrate starter modules + blueprint catalog. The backend owns every side
  // effect here; the CLI just reports the returned summary to the user.
  app.post("/registration", async (c) => {
    let body: { name?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /registration -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON with a 'name'." }, 400);
    }

    const name = typeof body.name === "string" ? body.name : "";

    try {
      const { registration, response, upgrade } = await registerHabitat(name);

      // An upgrade re-registers a legacy habitat only to capture its stream
      // credentials, so it must not re-hydrate (which would overwrite the
      // existing crew, modules, and their runtime state). It just updates the
      // registration row with the returned stream URL, token, and metadata.
      if (upgrade) {
        writeRegistrationSync(registration);
        console.log(
          `[habitat-api] POST /registration -> upgraded ${registration.habitatId} with stream credentials`,
        );
        return c.json({ registration, summary: null, upgraded: true }, 200);
      }

      const summary = await hydrateRegistration({ registration, response });

      console.log(
        `[habitat-api] POST /registration -> registered ${registration.habitatId} ` +
          `(${summary.modulesHydrated} modules, ${summary.humansHydrated} humans)`,
      );
      return c.json({ registration, summary }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] POST /registration -> 400 register failed");
      return c.json({ error: message }, 400);
    }
  });

  // DELETE /registration -> unregister from Kepler and clear local state.
  app.delete("/registration", async (c) => {
    try {
      const registration = await unregisterHabitat();
      clearHydratedState();
      await clearBlueprintCatalog();

      console.log(
        `[habitat-api] DELETE /registration -> removed ${registration.habitatId}`,
      );
      return c.json({ registration });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] DELETE /registration -> 400 unregister failed");
      return c.json({ error: message }, 400);
    }
  });

  // GET /status -> registration plus the live Kepler habitat record. When the
  // habitat is registered locally but Kepler is unreachable, `reachable` is
  // false and `habitat` is null so the CLI can still show the local record.
  app.get("/status", async (c) => {
    const registration = await readRegistration();
    const modules = await listHabitatModules();

    if (registration === null) {
      console.log("[habitat-api] GET /status -> not registered");
      return c.json({
        registration: null,
        habitat: null,
        reachable: false,
        modules: modules.length,
      });
    }

    try {
      const { habitat } = await fetchHabitatStatus();
      console.log("[habitat-api] GET /status -> registered, Kepler ok");
      return c.json({
        registration,
        habitat,
        reachable: true,
        modules: modules.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] GET /status -> registered, Kepler unreachable");
      return c.json({
        registration,
        habitat: null,
        reachable: false,
        modules: modules.length,
        error: message,
      });
    }
  });

  // --- Live clock ---------------------------------------------------------
  // The clock mode (manual vs Kepler) and the WebSocket that drives it are owned
  // here in the backend, not the CLI. These routes read and flip that saved
  // state; the CLI and dashboard are just clients of them.

  // GET /clock/status -> the persisted clock mode plus live connection view.
  app.get("/clock/status", (c) => {
    const state = readClockState();
    console.log(
      `[habitat-api] GET /clock/status -> ${state.mode}, listening ${
        state.listening ? "on" : "off"
      }`,
    );
    return c.json(clockStatusBody(state));
  });

  // POST /clock/listen { listening: boolean } -> turn Kepler listening on/off.
  // On: saves Kepler mode, then opens the authenticated WebSocket. Off: closes
  // the socket, drains any in-flight tick, then returns to manual mode.
  app.post("/clock/listen", async (c) => {
    let body: { listening?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "Request body must be JSON with a boolean 'listening'." },
        400,
      );
    }

    if (typeof body.listening !== "boolean") {
      return c.json({ error: "'listening' must be true or false." }, 400);
    }

    if (body.listening) {
      // A stream token is required to connect. Fail clearly rather than flipping
      // to Kepler mode with nothing to listen to.
      const registration = await readRegistration();
      if (registration === null || registration.streamApiToken === null) {
        console.log("[habitat-api] POST /clock/listen -> 400 no stream token");
        return c.json(
          {
            error:
              registration === null
                ? "This habitat is not registered yet."
                : "No stream credentials saved. Re-run 'habitat register' to upgrade this habitat before listening.",
          },
          400,
        );
      }

      getKeplerStream().enable();
      console.log("[habitat-api] POST /clock/listen -> listening on");
    } else {
      await getKeplerStream().disable();
      console.log("[habitat-api] POST /clock/listen -> listening off");
    }

    return c.json(clockStatusBody(readClockState()));
  });

  // GET /clock/events -> a long-running Server-Sent Events stream of future
  // planet_tick notices, owned entirely by this backend. It never replays past
  // events and never carries the stream token, so it is safe for the CLI's
  // `habitat clock watch` to consume without touching Kepler directly.
  app.get("/clock/events", (c) => {
    return streamSSE(c, async (stream) => {
      const queue: ClockEvent[] = [];
      let wake: (() => void) | null = null;

      const unsubscribe = getKeplerStream().subscribe((event) => {
        queue.push(event);
        wake?.();
      });

      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });

      console.log("[habitat-api] GET /clock/events -> watcher connected");

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = null;
            continue;
          }

          const event = queue.shift() as ClockEvent;
          await stream.writeSSE({
            event: "planet_tick",
            data: JSON.stringify(event),
          });
        }
      } finally {
        unsubscribe();
        console.log("[habitat-api] GET /clock/events -> watcher disconnected");
      }
    });
  });

  // --- Kepler catalog + solar reads (proxied) -----------------------------
  // The backend is the only part that knows how to reach Kepler. The CLI asks
  // for reference data here and formats it locally. Catalog data is never
  // hard-coded — it is always fetched fresh from the planet server.

  // GET /catalog/blueprints -> the full Kepler blueprint catalog.
  app.get("/catalog/blueprints", async (c) => {
    try {
      const catalog = await fetchBlueprintCatalog();
      console.log(
        `[habitat-api] GET /catalog/blueprints -> proxied to Kepler (${catalog.blueprints.length} blueprints)`,
      );
      return c.json(catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] GET /catalog/blueprints -> 502 Kepler error");
      return c.json({ error: message }, 502);
    }
  });

  // GET /catalog/blueprints/:blueprintId -> one blueprint, or 404.
  app.get("/catalog/blueprints/:blueprintId", async (c) => {
    const blueprintId = c.req.param("blueprintId");
    try {
      const blueprint = await showBlueprint(blueprintId);
      console.log(
        `[habitat-api] GET /catalog/blueprints/${blueprintId} -> proxied to Kepler`,
      );
      return c.json({ blueprint });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[habitat-api] GET /catalog/blueprints/${blueprintId} -> 404 not found`,
      );
      return c.json({ error: message }, 404);
    }
  });

  // GET /catalog/resources -> the full Kepler resource-type catalog.
  app.get("/catalog/resources", async (c) => {
    try {
      const catalog = await fetchResourceCatalog();
      console.log(
        `[habitat-api] GET /catalog/resources -> proxied to Kepler (${catalog.resources.length} resources)`,
      );
      return c.json(catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] GET /catalog/resources -> 502 Kepler error");
      return c.json({ error: message }, 502);
    }
  });

  // GET /solar/irradiance -> the planet's current sunlight reading.
  app.get("/solar/irradiance", async (c) => {
    try {
      const solarIrradiance = await fetchSolarIrradiance();
      console.log(
        `[habitat-api] GET /solar/irradiance -> proxied to Kepler (${solarIrradiance.wPerM2} W/m^2)`,
      );
      return c.json({ solarIrradiance });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] GET /solar/irradiance -> 502 Kepler error");
      return c.json({ error: message }, 502);
    }
  });

  // GET /world/scan?sensorStrength&radiusTiles -> Kepler's resource probability
  // estimate for the tiles around the deployed explorer. Read-only: the response
  // is passed through unchanged, and no resource truth or remaining quantity is
  // stored locally. Both `habitatId` and the scan origin come from saved local
  // state, so callers pass neither — there is no way to scan from a tile the
  // habitat's explorer is not standing on.
  app.get("/world/scan", async (c) => {
    const query = c.req.query();

    try {
      const body = await requestWorldScan({
        sensorStrength: parseCoordinate(query.sensorStrength),
        radiusTiles: parseCoordinate(query.radiusTiles ?? "0"),
      });

      console.log(
        `[habitat-api] GET /world/scan -> proxied to Kepler (${body.scan.tiles.length} tiles)`,
      );
      return c.json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        error instanceof ScanValidationError || error instanceof EvaValidationError
          ? 400
          : 502;
      console.log(`[habitat-api] GET /world/scan -> ${status}`);
      return c.json({ error: message }, status);
    }
  });

  // --- Exploration (SQLite-owned by the backend) --------------------------
  // The explorer's position is local state. Kepler is told where we are; it is
  // never asked, and it never decides.

  // GET /eva -> who is outside, where, and what they are carrying.
  app.get("/eva", async (c) => {
    const status = await getEvaStatus();
    console.log(
      `[habitat-api] GET /eva -> ${
        status.deployed
          ? `${status.human?.id} at (${status.position?.x}, ${status.position?.y})`
          : "nobody deployed"
      }`,
    );
    return c.json({ eva: status });
  });

  // POST /eva/deploy { humanId } -> send one human out through the suitport.
  app.post("/eva/deploy", async (c) => {
    let body: { humanId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /eva/deploy -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.humanId !== "string" || body.humanId === "") {
      console.log("[habitat-api] POST /eva/deploy -> 400 missing humanId");
      return c.json({ error: "A 'humanId' string is required." }, 400);
    }

    try {
      const status = await deployHuman(body.humanId);
      console.log(`[habitat-api] POST /eva/deploy -> deployed ${body.humanId}`);
      return c.json({ eva: status }, 201);
    } catch (error) {
      return respondEvaError(c, error, "POST /eva/deploy");
    }
  });

  // POST /eva/move { x, y } -> step one tile.
  app.post("/eva/move", async (c) => {
    let body: { x?: unknown; y?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /eva/move -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.x !== "number" || typeof body.y !== "number") {
      console.log("[habitat-api] POST /eva/move -> 400 missing coordinates");
      return c.json({ error: "Numeric 'x' and 'y' are required." }, 400);
    }

    try {
      const status = await moveExplorer(body.x, body.y);
      console.log(`[habitat-api] POST /eva/move -> (${body.x}, ${body.y})`);
      return c.json({ eva: status });
    } catch (error) {
      return respondEvaError(c, error, "POST /eva/move");
    }
  });

  // POST /eva/dock -> come home at (0, 0) and unload into local inventory.
  app.post("/eva/dock", async (c) => {
    try {
      const result = await dockExplorer();
      console.log(
        `[habitat-api] POST /eva/dock -> docked ${result.humanId}, unloaded ${result.unloaded.length} materials`,
      );
      return c.json(result);
    } catch (error) {
      return respondEvaError(c, error, "POST /eva/dock");
    }
  });

  // POST /eva/collect { quantityKg } -> take material from the current tile.
  app.post("/eva/collect", async (c) => {
    let body: { quantityKg?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /eva/collect -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.quantityKg !== "number") {
      console.log("[habitat-api] POST /eva/collect -> 400 missing quantityKg");
      return c.json({ error: "A numeric 'quantityKg' is required." }, 400);
    }

    try {
      const result = await collectMaterial(body.quantityKg);
      console.log(
        `[habitat-api] POST /eva/collect -> ${result.collectedKg} kg ${result.resourceType}`,
      );
      return c.json(result);
    } catch (error) {
      return respondEvaError(c, error, "POST /eva/collect");
    }
  });

  // --- Local module state (SQLite-owned by the backend) -------------------
  // The CLI keeps command-level validation and formatting, but the backend is
  // now the only writer of local module state.

  // GET /modules -> all local modules.
  app.get("/modules", async (c) => {
    const modules = await listHabitatModules();
    console.log(`[habitat-api] GET /modules -> ${modules.length} modules`);
    return c.json({ modules });
  });

  // GET /modules/:id -> one local module, or 404.
  app.get("/modules/:id", async (c) => {
    const id = c.req.param("id");
    const module = await getHabitatModule(id);

    if (module === null) {
      console.log(`[habitat-api] GET /modules/${id} -> 404 not found`);
      return c.json({ error: `Module '${id}' was not found.` }, 404);
    }

    console.log(`[habitat-api] GET /modules/${id} -> found`);
    return c.json({ module });
  });

  // POST /modules { blueprintId, displayName? } -> create from a blueprint.
  // The backend supplies Kepler's base URL from the local registration, so the
  // CLI never has to know how to reach Kepler.
  app.post("/modules", async (c) => {
    let body: { blueprintId?: unknown; displayName?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /modules -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.blueprintId !== "string" || body.blueprintId === "") {
      console.log("[habitat-api] POST /modules -> 400 missing blueprintId");
      return c.json({ error: "A 'blueprintId' string is required." }, 400);
    }

    try {
      const registration = await readRegistration();
      const module = await createHabitatModule({
        blueprintId: body.blueprintId,
        displayName:
          typeof body.displayName === "string" ? body.displayName : undefined,
        baseUrl: registration?.baseUrl,
      });

      console.log(`[habitat-api] POST /modules -> created ${module.id}`);
      return c.json({ module }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] POST /modules -> 400 create failed");
      return c.json({ error: message }, 400);
    }
  });

  // PATCH /modules/:id { displayName?, connectedTo?, status?, condition? }
  app.patch("/modules/:id", async (c) => {
    const id = c.req.param("id");

    let patch: {
      displayName?: string;
      connectedTo?: string[];
      status?: string;
      condition?: number;
    };
    try {
      patch = await c.req.json();
    } catch {
      console.log(`[habitat-api] PATCH /modules/${id} -> 400 invalid JSON`);
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    try {
      const module = await updateHabitatModule(id, patch);
      console.log(`[habitat-api] PATCH /modules/${id} -> updated`);
      return c.json({ module });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("was not found") ? 404 : 400;
      console.log(`[habitat-api] PATCH /modules/${id} -> ${status}`);
      return c.json({ error: message }, status);
    }
  });

  // DELETE /modules/:id -> remove one module, or 404. Refused while a human is
  // standing in it.
  app.delete("/modules/:id", async (c) => {
    const id = c.req.param("id");
    try {
      requireModuleUnoccupied(id);
      const module = await deleteHabitatModule(id);
      console.log(`[habitat-api] DELETE /modules/${id} -> deleted`);
      return c.json({ module });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("was not found") ? 404 : 400;
      console.log(`[habitat-api] DELETE /modules/${id} -> ${status}`);
      return c.json({ error: message }, status);
    }
  });

  // --- Local crew state (SQLite-owned by the backend) ---------------------
  // Humans are seeded once, by registration, from starterHumans. There is no
  // route that creates one: the registration payload is the only source.

  // GET /humans -> the habitat's crew and the module each one is in.
  app.get("/humans", async (c) => {
    const humans = await listHumans();
    console.log(`[habitat-api] GET /humans -> ${humans.length} humans`);
    return c.json({ humans });
  });

  // PATCH /humans/:id { locationModuleId } -> move a human between modules.
  app.patch("/humans/:id", async (c) => {
    const id = c.req.param("id");

    let body: { locationModuleId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log(`[habitat-api] PATCH /humans/${id} -> 400 invalid JSON`);
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (
      typeof body.locationModuleId !== "string" ||
      body.locationModuleId === ""
    ) {
      console.log(`[habitat-api] PATCH /humans/${id} -> 400 missing module`);
      return c.json({ error: "A 'locationModuleId' string is required." }, 400);
    }

    try {
      const human = await moveHuman(id, body.locationModuleId);
      console.log(
        `[habitat-api] PATCH /humans/${id} -> moved to ${human.locationModuleId}`,
      );
      return c.json({ human });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = describeHumanErrorStatus(error, message);
      console.log(`[habitat-api] PATCH /humans/${id} -> ${status}`);
      return c.json({ error: message }, status);
    }
  });

  // --- Operational alerts (SQLite-owned by the backend) -------------------
  // Alerts are raised by the subsystems that notice the condition, not by a
  // route. What is exposed here is reading them and acting on them.

  // GET /alerts -> every alert, unresolved first.
  app.get("/alerts", async (c) => {
    const alerts = await listAlerts();
    const open = alerts.filter((alert) => alert.status === "open").length;
    console.log(`[habitat-api] GET /alerts -> ${alerts.length} alerts, ${open} open`);
    return c.json({ alerts });
  });

  // POST /alerts/:id/acknowledge -> an operator has seen it.
  app.post("/alerts/:id/acknowledge", async (c) => {
    const id = c.req.param("id");

    try {
      const alert = await acknowledgeAlert(id);
      console.log(`[habitat-api] POST /alerts/${id}/acknowledge -> ${alert.status}`);
      return c.json({ alert });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        error instanceof AlertValidationError
          ? message.includes("was not found")
            ? 404
            : 400
          : 500;
      console.log(`[habitat-api] POST /alerts/${id}/acknowledge -> ${status}`);
      return c.json({ error: message }, status);
    }
  });

  // --- Local inventory state (SQLite-owned by the backend) ----------------

  // GET /inventory -> all local material stacks.
  app.get("/inventory", async (c) => {
    const inventory = await listInventory();
    console.log(`[habitat-api] GET /inventory -> ${inventory.length} entries`);
    return c.json({ inventory });
  });

  // POST /inventory { resource, quantity } -> add materials. Quantity is
  // validated on the CLI side; the backend applies the change to local state.
  app.post("/inventory", async (c) => {
    let body: { resource?: unknown; quantity?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /inventory -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.resource !== "string" || body.resource === "") {
      console.log("[habitat-api] POST /inventory -> 400 missing resource");
      return c.json({ error: "A 'resource' string is required." }, 400);
    }
    if (typeof body.quantity !== "number") {
      console.log("[habitat-api] POST /inventory -> 400 missing quantity");
      return c.json({ error: "A numeric 'quantity' is required." }, 400);
    }

    try {
      const entry = await addInventory(body.resource, body.quantity);
      console.log(
        `[habitat-api] POST /inventory -> ${entry.resource} now ${entry.quantity}`,
      );
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] POST /inventory -> 400 add failed");
      return c.json({ error: message }, 400);
    }
  });

  // --- Simulation: power ticks + construction -----------------------------
  // These are domain operations, so they use action-shaped routes. The backend
  // runs the simulation (reading/writing local state and fetching Kepler solar
  // data); the CLI keeps the human-facing formatting.

  // POST /ticks { count } -> advance the power/construction simulation.
  app.post("/ticks", async (c) => {
    let body: { count?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /ticks -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    // Manual ticks are only allowed while listening to Kepler is off. The check
    // reads the saved clock mode, which is flipped to 'kepler' before the socket
    // opens, so a manual tick can never slip in during the connect window.
    if (isListening()) {
      console.log("[habitat-api] POST /ticks -> 409 rejected (listening on)");
      return c.json(
        {
          error:
            "Manual ticks are disabled while listening to Kepler.\n" +
            "Kepler is driving this habitat's clock. Run 'habitat clock listen off' to return to manual mode.",
        },
        409,
      );
    }

    const count = typeof body.count === "number" ? body.count : NaN;

    try {
      const summary = await runPowerTicks(count);
      console.log(`[habitat-api] POST /ticks -> advanced ${summary.ticks} ticks`);
      return c.json({ summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] POST /ticks -> 400 tick failed");
      return c.json({ error: message }, 400);
    }
  });

  // GET /construction -> active construction jobs.
  app.get("/construction", async (c) => {
    const active = await listActiveConstructions();
    console.log(`[habitat-api] GET /construction -> ${active.length} active`);
    return c.json({ active });
  });

  // POST /construction { blueprintId, dryRun? } -> evaluate readiness (dry run)
  // or actually start a construction job. Kepler's base URL comes from the
  // local registration, so the CLI never talks to Kepler itself.
  app.post("/construction", async (c) => {
    let body: { blueprintId?: unknown; dryRun?: unknown };
    try {
      body = await c.req.json();
    } catch {
      console.log("[habitat-api] POST /construction -> 400 invalid JSON");
      return c.json({ error: "Request body must be JSON." }, 400);
    }

    if (typeof body.blueprintId !== "string" || body.blueprintId === "") {
      console.log("[habitat-api] POST /construction -> 400 missing blueprintId");
      return c.json({ error: "A 'blueprintId' string is required." }, 400);
    }

    const registration = await readRegistration();
    const baseUrl = registration?.baseUrl;

    try {
      if (body.dryRun === true) {
        const evaluation = await evaluateConstruction(body.blueprintId, baseUrl);
        console.log(
          `[habitat-api] POST /construction (dry-run) -> ${
            evaluation.canStart ? "can start" : "cannot start"
          }`,
        );
        return c.json({ evaluation });
      }

      const result = await startConstruction(body.blueprintId, baseUrl);
      console.log(
        `[habitat-api] POST /construction -> started on ${result.facilityId}`,
      );
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("[habitat-api] POST /construction -> 400 construction failed");
      return c.json({ error: message }, 400);
    }
  });

  // DELETE /construction/:facilityId -> cancel a facility's construction job.
  app.delete("/construction/:facilityId", async (c) => {
    const facilityId = c.req.param("facilityId");
    try {
      const result = await cancelConstruction(facilityId);
      console.log(
        `[habitat-api] DELETE /construction/${facilityId} -> canceled`,
      );
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("was not found") ? 404 : 400;
      console.log(
        `[habitat-api] DELETE /construction/${facilityId} -> ${status}`,
      );
      return c.json({ error: message }, status);
    }
  });

  return app;
}

// A refused EVA action is the caller's fault (400); anything else means the
// habitat could not reach Kepler to check the world, which is a 502.
function respondEvaError(c: Context, error: unknown, route: string) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof EvaValidationError ? 400 : 502;

  console.log(`[habitat-api] ${route} -> ${status}`);
  return c.json({ error: message }, status);
}

// A rejected crew action is a 404 when the thing named does not exist and a 400
// when it exists but the rule says no. Anything that is not a validation error
// is a genuine fault, so it surfaces as a 500.
function describeHumanErrorStatus(error: unknown, message: string): 400 | 404 | 500 {
  if (!(error instanceof HumanValidationError)) {
    return 500;
  }

  return message.includes("was not found") ? 404 : 400;
}

// Query strings are always text. Turn one into a number without letting the
// empty string quietly become 0 — scan.ts rejects anything that is not an
// integer, so NaN surfaces as a clear validation message.
function parseCoordinate(value: string | undefined): number {
  return value === undefined || value.trim() === "" ? NaN : Number(value);
}
