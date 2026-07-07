#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import {
  fetchHabitatStatus,
  readRegistration,
  registerHabitat,
  registrationPath,
  unregisterHabitat,
} from "./kepler";

const program = new Command();

program
  .name("habitat")
  .description("Register a habitat with the Kepler planet server.")
  .version(packageJson.version);

program.configureOutput({
  outputError: (message, write) => {
    if (message.includes("unknown command")) {
      write(
        `Habitat does not recognize that command yet.\nRun 'habitat --help' to see what is available.\n\n${message}`,
      );
      return;
    }

    write(message);
  },
});

program.addHelpText(
  "after",
  `
Commands:
  habitat register --name "<habitat name>"   register this habitat with Kepler
  habitat status                             show registration status
  habitat unregister                         remove this habitat from Kepler

Registration state:
  Saved locally to ${registrationPath}
  Run commands from the same directory to use the same registration.

Config via environment:
  KEPLER_BASE_URL      planet server base URL
                       (default https://planet.turingguild.com)
  KEPLER_PLANET_TOKEN  bearer token sent as 'Authorization: Bearer <token>'
                       (KEPLER_TOKEN also accepted; default admin-dev-token
                       for local development)

Agent discovery:
  habitat --help
  habitat register --help
  habitat status --help
  habitat unregister --help
`,
);

program
  .command("register")
  .description("Register this habitat with the Kepler planet server.")
  .requiredOption("-n, --name <name>", "habitat display name")
  .action(async (options: { name: string }) => {
    try {
      const { registration, response } = await registerHabitat(options.name);

      console.log(`Registered habitat '${registration.displayName}' with Kepler.`);
      console.log(`Habitat ID: ${registration.habitatId}`);
      console.log(`Habitat UUID: ${registration.habitatUuid}`);
      console.log(`Starter modules: ${response.starterModules.length}`);
      console.log(`Blueprints: ${response.blueprints.length}`);
      console.log(`Saved registration to ${registrationPath}`);
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("status")
  .description("Show Kepler registration status for this habitat.")
  .action(async () => {
    try {
      const registration = await readRegistration();

      if (registration === null) {
        console.log("Registered: no");
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
      } catch (error) {
        // Registered locally but the server was unreachable; show what we have.
        console.log("Registered: yes (local record only)");
        console.log(`Habitat ID: ${registration.habitatId}`);
        console.log(`Name: ${registration.displayName}`);
        console.log(
          `Could not reach Kepler: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("unregister")
  .description("Unregister this habitat from the Kepler planet server.")
  .action(async () => {
    try {
      const registration = await unregisterHabitat();

      console.log(
        `Unregistered habitat '${registration.displayName}' (habitatId ${registration.habitatId}) from Kepler.`,
      );
      console.log(`Removed local registration at ${registrationPath}`);
    } catch (error) {
      reportError(error);
    }
  });

await program.parseAsync();

function reportError(error: unknown): void {
  program.error(error instanceof Error ? error.message : String(error));
}
