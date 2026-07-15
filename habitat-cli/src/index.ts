#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { databasePath } from "./kepler";
import { registerRegistrationCommands } from "./commands/registration";
import { registerModuleCommands } from "./commands/module";
import { registerTickCommands } from "./commands/tick";
import { registerCatalogCommands } from "./commands/catalog";
import { registerInventoryCommands } from "./commands/inventory";
import { registerConstructionCommands } from "./commands/construction";
import { registerSolarCommands } from "./commands/solar";
import { registerScanCommands } from "./commands/scan";
import { registerHumanCommands } from "./commands/human";

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
  habitat module list                        list local Habitat modules
  habitat module status                      show module states and power draw
  habitat module show <module-id>            show one local Habitat module
  habitat module create --blueprint-id <id>  create a module from a blueprint
  habitat module update <module-id>          update a local Habitat module
  habitat module set-status <id> <status>    set a module's runtime status
  habitat module delete <module-id>          delete a local Habitat module
  habitat human list                         list humans and the module each is in
  habitat human move <human-id> <module-id>  move a human to another module
  habitat tick [count]                       advance the simulation by N ticks
  habitat solar status                       show current solar irradiance from Kepler
  habitat scan --x <n> --y <n> --strength <n>  estimate nearby resources from Kepler
  habitat inventory list                     list local materials on hand
  habitat inventory add <resource> <qty>     add materials to local inventory
  habitat construct <blueprint-id>           start construction from a blueprint
  habitat construct <blueprint-id> --dry-run check readiness without changing state
  habitat construction status                show active construction jobs
  habitat construction cancel <facility-id>  cancel a facility's construction job
  habitat blueprint list                     list blueprints in the Kepler catalog
  habitat blueprint show <blueprint-id>      show one Kepler blueprint's details
  habitat resource list                      list resource types in the Kepler catalog
  habitat unregister                         remove this habitat from Kepler

Registration state:
  Saved locally in the SQLite database at ${databasePath}
  Run commands from the same directory to use the same registration.

Module state:
  Saved locally to .habitat/modules.json
  Blueprint catalog cached locally in .habitat/blueprints.json

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
  habitat module --help
  habitat module list --help
  habitat module status --help
  habitat module show --help
  habitat module create --help
  habitat module update --help
  habitat module set-status --help
  habitat module delete --help
  habitat human --help
  habitat human list --help
  habitat human move --help
  habitat tick --help
  habitat scan --help
  habitat inventory --help
  habitat inventory list --help
  habitat inventory add --help
  habitat construct --help
  habitat construction --help
  habitat construction status --help
  habitat construction cancel --help
  habitat blueprint --help
  habitat blueprint list --help
  habitat blueprint show --help
  habitat resource --help
  habitat resource list --help
  habitat unregister --help
`,
);

// Command wiring lives in focused modules under src/commands/; this file is just
// the composition root that assembles them onto the program.
// Order matches the original single-file wiring so the auto-generated command
// list in --help is unchanged.
registerRegistrationCommands(program);
registerTickCommands(program);
registerModuleCommands(program);
registerCatalogCommands(program);
registerInventoryCommands(program);
registerConstructionCommands(program);
registerSolarCommands(program);
registerScanCommands(program);
registerHumanCommands(program);

await program.parseAsync();
