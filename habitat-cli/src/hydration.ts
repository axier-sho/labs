import { getDb } from "./db";
import { writeAlertContractSync, clearAlertContractSync } from "./alerts";
import {
  writeRegistrationSync,
  type RegisterResponse,
  type Registration,
} from "./kepler";
import {
  clearHabitatModuleStateSync,
  hydrateStarterModules,
  seedBlueprintState,
  writeModulesSync,
} from "./modules";
import { clearHumansSync, hydrateStarterHumans, writeHumansSync } from "./humans";

// Turning a registration response into local state. A habitat is registered, has
// its starter modules, and has its starter crew, or it is none of those things —
// there is no in-between where `habitat status` says "registered" but the crew
// never landed. That is what makes this one transaction rather than three
// writes in a row.

export type HydrationSummary = {
  modulesHydrated: number;
  humansHydrated: number;
  blueprintsCached: number;
  alertContractVersion: string;
};

export async function hydrateRegistration(input: {
  registration: Registration;
  response: RegisterResponse;
}): Promise<HydrationSummary> {
  const { registration, response } = input;

  // Blueprints are a cache of Kepler's catalog, not habitat state, and they live
  // in a file rather than the database — so they are seeded before the
  // transaction opens. Re-seeding a cache is harmless if the transaction below
  // then fails; a half-written database would not be.
  await seedBlueprintState(response.blueprints);

  // Both of these can throw, and both do so before anything is written.
  const { modules, localIdByStarterId } = hydrateStarterModules(
    response.starterModules,
  );
  const humans = hydrateStarterHumans(
    response.starterHumans,
    localIdByStarterId,
  );

  getDb().transaction(() => {
    writeRegistrationSync(registration);
    writeModulesSync(modules);
    writeHumansSync(humans);
    writeAlertContractSync(response.contracts.alerts);
  })();

  return {
    modulesHydrated: modules.length,
    humansHydrated: humans.length,
    blueprintsCached: response.blueprints.length,
    alertContractVersion: response.contracts.alerts.schemaVersion,
  };
}

// The mirror image of hydration: unregistering leaves no crew, no modules, and
// no alert contract behind.
export function clearHydratedState(): void {
  getDb().transaction(() => {
    clearHumansSync();
    clearHabitatModuleStateSync();
    clearAlertContractSync();
  })();
}
