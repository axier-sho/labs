import type { Command } from "commander";
import type { HabitatRecord, Registration } from "../kepler";
import { apiBaseUrl, apiDelete, apiGet, apiPost } from "../api-client";
import { reportError } from "../cli";

// Registration now goes through the local Habitat backend over HTTP. The CLI no
// longer calls Kepler or writes SQLite directly — it asks the backend to do
// that and formats the structured JSON it gets back for humans.

type RegisterResult = {
  registration: Registration;
  summary: { starterModulesHydrated: number; blueprintsCached: number };
};

type StatusResult = {
  registration: Registration | null;
  habitat: HabitatRecord | null;
  reachable: boolean;
  modules: number;
  error?: string;
};

export function registerRegistrationCommands(program: Command): void {
  program
    .command("register")
    .description("Register this habitat with the Kepler planet server.")
    .requiredOption("-n, --name <name>", "habitat display name")
    .action(async (options: { name: string }) => {
      try {
        const { registration, summary } = await apiPost<RegisterResult>(
          "/registration",
          { name: options.name },
        );

        console.log(`Registered habitat '${registration.displayName}' with Kepler.`);
        console.log(`Habitat ID: ${registration.habitatId}`);
        console.log(`Habitat UUID: ${registration.habitatUuid}`);
        console.log(`Starter modules hydrated: ${summary.starterModulesHydrated}`);
        console.log(`Blueprints cached: ${summary.blueprintsCached}`);
        console.log(`Saved registration via ${apiBaseUrl()}`);
      } catch (error) {
        reportError(program, error);
      }
    });

  program
    .command("status")
    .description("Show Kepler registration status for this habitat.")
    .action(async () => {
      try {
        const status = await apiGet<StatusResult>("/status");

        if (status.registration === null) {
          console.log("Registered: no");
          console.log(`Modules: ${status.modules}`);
          console.log(
            'Run \'habitat register --name "<habitat name>"\' to register.',
          );
          return;
        }

        if (status.reachable && status.habitat !== null) {
          const habitat = status.habitat;
          console.log("Registered: yes");
          console.log(`Habitat ID: ${habitat.id}`);
          console.log(`Name: ${habitat.displayName}`);
          console.log(`Slug: ${habitat.habitatSlug}`);
          console.log(`Catalog version: ${habitat.catalogVersion}`);
          console.log(`Server status: ${habitat.status}`);
          console.log(`Last seen: ${habitat.lastSeenAt ?? "never"}`);
          console.log(`Modules: ${status.modules}`);
          return;
        }

        // Registered locally but the server was unreachable; show what we have.
        console.log("Registered: yes (local record only)");
        console.log(`Habitat ID: ${status.registration.habitatId}`);
        console.log(`Name: ${status.registration.displayName}`);
        console.log(`Modules: ${status.modules}`);
        if (status.error !== undefined) {
          console.log(`Could not reach Kepler: ${status.error}`);
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
        const { registration } = await apiDelete<{ registration: Registration }>(
          "/registration",
        );

        console.log(
          `Unregistered habitat '${registration.displayName}' (habitatId ${registration.habitatId}) from Kepler.`,
        );
        console.log(`Removed local registration via ${apiBaseUrl()}`);
      } catch (error) {
        reportError(program, error);
      }
    });
}
