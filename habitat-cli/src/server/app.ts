import { Hono } from "hono";
import {
  fetchBlueprintCatalog,
  fetchHabitatStatus,
  fetchResourceCatalog,
  fetchSolarIrradiance,
  readRegistration,
  registerHabitat,
  unregisterHabitat,
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

// The Hono backend is the REST boundary the CLI talks to. It — not the CLI —
// owns the local SQLite state and all Kepler transport. This keeps the CLI
// portable: point HABITAT_API_BASE_URL at a different host and the same CLI
// keeps working.
//
// Routes return JSON, never terminal-formatted text. Human-friendly formatting
// stays on the CLI side.
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
      const { registration, response } = await registerHabitat(name);
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

  // GET /world/scan?x&y&sensorStrength&radiusTiles -> Kepler's resource
  // probability estimate for the tiles around a position. Read-only: the
  // response is passed through unchanged, and no resource truth or remaining
  // quantity is stored locally. `habitatId` is supplied from the saved
  // registration, so callers never pass one.
  app.get("/world/scan", async (c) => {
    const query = c.req.query();

    try {
      const body = await requestWorldScan({
        x: parseCoordinate(query.x),
        y: parseCoordinate(query.y),
        sensorStrength: parseCoordinate(query.sensorStrength),
        radiusTiles: parseCoordinate(query.radiusTiles ?? "0"),
      });

      console.log(
        `[habitat-api] GET /world/scan -> proxied to Kepler (${body.scan.tiles.length} tiles)`,
      );
      return c.json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof ScanValidationError ? 400 : 502;
      console.log(`[habitat-api] GET /world/scan -> ${status}`);
      return c.json({ error: message }, status);
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
