import type { Command } from "commander";
import {
  fetchHabitatStatus,
  readRegistration,
  registerHabitat,
  registrationPath,
  unregisterHabitat,
} from "../kepler";
import {
  clearBlueprintCatalog,
  clearHabitatModuleState,
  hydrateModulesFromRegistration,
  listHabitatModules,
} from "../modules";
import { reportError } from "../cli";

export function registerRegistrationCommands(program: Command): void {
  program
    .command("register")
    .description("Register this habitat with the Kepler planet server.")
    .requiredOption("-n, --name <name>", "habitat display name")
    .action(async (options: { name: string }) => {
      try {
        const { registration, response } = await registerHabitat(options.name);
        await hydrateModulesFromRegistration({
          starterModules: response.starterModules,
          blueprints: response.blueprints,
        });

        console.log(`Registered habitat '${registration.displayName}' with Kepler.`);
        console.log(`Habitat ID: ${registration.habitatId}`);
        console.log(`Habitat UUID: ${registration.habitatUuid}`);
        console.log(`Starter modules hydrated: ${response.starterModules.length}`);
        console.log(`Blueprints cached: ${response.blueprints.length}`);
        console.log(`Saved registration to ${registrationPath}`);
      } catch (error) {
        reportError(program, error);
      }
    });

  program
    .command("status")
    .description("Show Kepler registration status for this habitat.")
    .action(async () => {
      try {
        const registration = await readRegistration();
        const modules = await listHabitatModules();

        if (registration === null) {
          console.log("Registered: no");
          console.log(`Modules: ${modules.length}`);
          console.log(
            'Run \'habitat register --name "<habitat name>"\' to register.',
          );
          return;
        }

        try {
          const { habitat } = await fetchHabitatStatus();

          console.log("Registered: yes");
          console.log(`Habitat ID: ${habitat.id}`);
          console.log(`Name: ${habitat.displayName}`);
          console.log(`Slug: ${habitat.habitatSlug}`);
          console.log(`Catalog version: ${habitat.catalogVersion}`);
          console.log(`Server status: ${habitat.status}`);
          console.log(`Last seen: ${habitat.lastSeenAt ?? "never"}`);
          console.log(`Modules: ${modules.length}`);
        } catch (error) {
          // Registered locally but the server was unreachable; show what we have.
          console.log("Registered: yes (local record only)");
          console.log(`Habitat ID: ${registration.habitatId}`);
          console.log(`Name: ${registration.displayName}`);
          console.log(`Modules: ${modules.length}`);
          console.log(
            `Could not reach Kepler: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } catch (error) {
        reportError(program, error);
      }
    });

  program
    .command("unregister")
    .description("Unregister this habitat from the Kepler planet server.")
    .action(async () => {
      try {
        const registration = await unregisterHabitat();
        await clearHabitatModuleState();
        await clearBlueprintCatalog();

        console.log(
          `Unregistered habitat '${registration.displayName}' (habitatId ${registration.habitatId}) from Kepler.`,
        );
        console.log(`Removed local registration at ${registrationPath}`);
      } catch (error) {
        reportError(program, error);
      }
    });
}
