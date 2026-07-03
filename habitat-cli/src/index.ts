#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import {
  addDoorToAirlock,
  createAirlock,
  createDoor,
  createGreenhouse,
  createRover,
  createSensor,
  createZone,
  deleteAirlock,
  deleteDoor,
  deleteGreenhouse,
  deleteRover,
  deleteSensor,
  deleteZone,
  getHabitatStatus,
  habitatDataPath,
  listAirlocks,
  listDoors,
  listGreenhouses,
  listRovers,
  listSensors,
  listZones,
  showAirlock,
  showDoor,
  showGreenhouse,
  showRover,
  showSensor,
  showZone,
  updateAirlock,
  updateDoor,
  updateGreenhouse,
  updateRover,
  updateSensor,
  updateZone,
} from "./store";

const program = new Command();

program
  .name("habitat")
  .description("Manage local habitat objects from a JSON-backed CLI.")
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
Data:
  habitat stores data in ${habitatDataPath}
  Run commands from the same directory to use the same habitat data file.
  The file is JSON with top-level arrays: zones, doors, sensors, rovers,
  greenhouses, and airlocks.

Value types:
  Strings: pass plain text values, quote values that contain spaces.
  Numbers: pass finite numeric values, such as 22.5 or 87.
  Booleans: pass true or false.

Command pattern:
  habitat status
  habitat <object> create <name> [required options]
  habitat <object> list
  habitat <object> show <name>
  habitat <object> update <name> [fields to change]
  habitat <object> delete <name>

Exact create commands:
  habitat zone create <name> --purpose <purpose> --status <status>
  habitat door create <name> --status <status> --locked <true|false>
  habitat sensor create <name> --type <type> --reading <reading> --status <status>
  habitat rover create <name> --location <location> --battery-level <number> --status <status>
  habitat greenhouse create <name> --crop <crop> --temperature <number> --status <status>
  habitat airlock create <name> --pressure-level <number> --locked <true|false>

Update fields:
  zone: --name, --purpose, --status
  door: --name, --status, --locked
  sensor: --name, --type, --reading, --status
  rover: --name, --location, --battery-level, --status
  greenhouse: --name, --crop, --temperature, --status
  airlock: --name, --pressure-level, --locked

Relationship command:
  habitat airlock add-door <airlockName> <doorName>
  Airlocks store attached door names in their doorNames array.

Output:
  list commands print tab-separated rows.
  show commands print one field per line.
  create, update, and delete commands print a success message.
  Missing objects and invalid option values exit non-zero with an error.

Discovery:
  habitat --help
  habitat status --help
  habitat <object> --help
  habitat <object> create --help
  habitat <object> update --help
  habitat airlock add-door --help
`,
);

const zone = program
  .command("zone")
  .description("Manage habitat zones.");

program
  .command("status")
  .description("Print a summary of habitat object counts.")
  .action(async () => {
    try {
      const status = await getHabitatStatus();

      console.log("Habitat status");
      console.log(`Zones: ${status.zones}`);
      console.log(`Doors: ${status.doors}`);
      console.log(`Airlocks: ${status.airlocks}`);
      console.log(`Sensors: ${status.sensors}`);
      console.log(`Rovers: ${status.rovers}`);
      console.log(`Greenhouses: ${status.greenhouses}`);
      console.log(`Total objects: ${status.total}`);
    } catch (error) {
      reportError(error);
    }
  });

zone.addHelpText(
  "after",
  `
Fields:
  name string, purpose string, status string

List output:
  <name> <status> <purpose>

Examples:
  habitat zone create lab --purpose research --status active
  habitat zone list
  habitat zone show lab
  habitat zone update lab --status maintenance
  habitat zone delete lab
`,
);

zone
  .command("create")
  .description("Create a zone.")
  .argument("<name>", "zone name")
  .requiredOption("-p, --purpose <purpose>", "zone purpose")
  .requiredOption("-s, --status <status>", "zone status")
  .action(async (name: string, options: { purpose: string; status: string }) => {
    try {
      const createdZone = await createZone({
        name,
        purpose: options.purpose,
        status: options.status,
      });

      console.log(`Created zone '${createdZone.name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

zone
  .command("list")
  .description("List zones.")
  .action(async () => {
    try {
      const zones = await listZones();

      if (zones.length === 0) {
        console.log("No zones found.");
        return;
      }

      for (const zone of zones) {
        console.log(`${zone.name}\t${zone.status}\t${zone.purpose}`);
      }
    } catch (error) {
      reportError(error);
    }
  });

zone
  .command("show")
  .description("Show one zone.")
  .argument("<name>", "zone name")
  .action(async (name: string) => {
    try {
      const zone = await showZone(name);

      console.log(`Name: ${zone.name}`);
      console.log(`Purpose: ${zone.purpose}`);
      console.log(`Status: ${zone.status}`);
    } catch (error) {
      reportError(error);
    }
  });

zone
  .command("update")
  .description("Update a zone.")
  .argument("<name>", "zone name")
  .option("-n, --name <name>", "new zone name")
  .option("-p, --purpose <purpose>", "new zone purpose")
  .option("-s, --status <status>", "new zone status")
  .action(
    async (
      name: string,
      options: { name?: string; purpose?: string; status?: string },
    ) => {
      try {
        const updatedZone = await updateZone(name, options);

        console.log(`Updated zone '${updatedZone.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

zone
  .command("delete")
  .description("Delete a zone.")
  .argument("<name>", "zone name")
  .action(async (name: string) => {
    try {
      await deleteZone(name);

      console.log(`Deleted zone '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

const door = program
  .command("door")
  .description("Manage habitat doors.");

door.addHelpText(
  "after",
  `
Fields:
  name string, status string, locked boolean

List output:
  <name> <status> locked=<true|false>

Examples:
  habitat door create inner-door --status closed --locked true
  habitat door list
  habitat door show inner-door
  habitat door update inner-door --locked false
  habitat door delete inner-door
`,
);

door
  .command("create")
  .description("Create a door.")
  .argument("<name>", "door name")
  .requiredOption("-s, --status <status>", "door status")
  .requiredOption(
    "-l, --locked <locked>",
    "whether the door is locked",
    parseBooleanOption,
  )
  .action(async (name: string, options: { status: string; locked: boolean }) => {
    try {
      const createdDoor = await createDoor({
        name,
        status: options.status,
        locked: options.locked,
      });

      console.log(`Created door '${createdDoor.name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

door
  .command("list")
  .description("List doors.")
  .action(async () => {
    try {
      const doors = await listDoors();

      if (doors.length === 0) {
        console.log("No doors found.");
        return;
      }

      for (const door of doors) {
        console.log(`${door.name}\t${door.status}\tlocked=${door.locked}`);
      }
    } catch (error) {
      reportError(error);
    }
  });

door
  .command("show")
  .description("Show one door.")
  .argument("<name>", "door name")
  .action(async (name: string) => {
    try {
      const door = await showDoor(name);

      console.log(`Name: ${door.name}`);
      console.log(`Status: ${door.status}`);
      console.log(`Locked: ${door.locked}`);
    } catch (error) {
      reportError(error);
    }
  });

door
  .command("update")
  .description("Update a door.")
  .argument("<name>", "door name")
  .option("-n, --name <name>", "new door name")
  .option("-s, --status <status>", "new door status")
  .option(
    "-l, --locked <locked>",
    "whether the door is locked",
    parseBooleanOption,
  )
  .action(
    async (
      name: string,
      options: { name?: string; status?: string; locked?: boolean },
    ) => {
      try {
        const updatedDoor = await updateDoor(name, options);

        console.log(`Updated door '${updatedDoor.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

door
  .command("delete")
  .description("Delete a door.")
  .argument("<name>", "door name")
  .action(async (name: string) => {
    try {
      await deleteDoor(name);

      console.log(`Deleted door '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

const sensor = program
  .command("sensor")
  .description("Manage habitat sensors.");

sensor.addHelpText(
  "after",
  `
Fields:
  name string, type string, reading string, status string

List output:
  <name> <status> <type> <reading>

Examples:
  habitat sensor create oxygen-1 --type oxygen --reading 20.9 --status nominal
  habitat sensor list
  habitat sensor show oxygen-1
  habitat sensor update oxygen-1 --reading 21.1 --status alert
  habitat sensor delete oxygen-1
`,
);

sensor
  .command("create")
  .description("Create a sensor.")
  .argument("<name>", "sensor name")
  .requiredOption("-t, --type <type>", "sensor type")
  .requiredOption("-r, --reading <reading>", "sensor reading")
  .requiredOption("-s, --status <status>", "sensor status")
  .action(
    async (
      name: string,
      options: { type: string; reading: string; status: string },
    ) => {
      try {
        const createdSensor = await createSensor({
          name,
          type: options.type,
          reading: options.reading,
          status: options.status,
        });

        console.log(`Created sensor '${createdSensor.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

sensor
  .command("list")
  .description("List sensors.")
  .action(async () => {
    try {
      const sensors = await listSensors();

      if (sensors.length === 0) {
        console.log("No sensors found.");
        return;
      }

      for (const sensor of sensors) {
        console.log(
          `${sensor.name}\t${sensor.status}\t${sensor.type}\t${sensor.reading}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

sensor
  .command("show")
  .description("Show one sensor.")
  .argument("<name>", "sensor name")
  .action(async (name: string) => {
    try {
      const sensor = await showSensor(name);

      console.log(`Name: ${sensor.name}`);
      console.log(`Type: ${sensor.type}`);
      console.log(`Reading: ${sensor.reading}`);
      console.log(`Status: ${sensor.status}`);
    } catch (error) {
      reportError(error);
    }
  });

sensor
  .command("update")
  .description("Update a sensor.")
  .argument("<name>", "sensor name")
  .option("-n, --name <name>", "new sensor name")
  .option("-t, --type <type>", "new sensor type")
  .option("-r, --reading <reading>", "new sensor reading")
  .option("-s, --status <status>", "new sensor status")
  .action(
    async (
      name: string,
      options: {
        name?: string;
        type?: string;
        reading?: string;
        status?: string;
      },
    ) => {
      try {
        const updatedSensor = await updateSensor(name, options);

        console.log(`Updated sensor '${updatedSensor.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

sensor
  .command("delete")
  .description("Delete a sensor.")
  .argument("<name>", "sensor name")
  .action(async (name: string) => {
    try {
      await deleteSensor(name);

      console.log(`Deleted sensor '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

const rover = program
  .command("rover")
  .description("Manage habitat rovers.");

rover.addHelpText(
  "after",
  `
Fields:
  name string, location string, batteryLevel number, status string

List output:
  <name> <status> <location> battery=<number>

Examples:
  habitat rover create scout-1 --location bay-alpha --battery-level 87 --status idle
  habitat rover list
  habitat rover show scout-1
  habitat rover update scout-1 --location ridge-2 --status active
  habitat rover delete scout-1
`,
);

rover
  .command("create")
  .description("Create a rover.")
  .argument("<name>", "rover name")
  .requiredOption("-l, --location <location>", "rover location")
  .requiredOption(
    "-b, --battery-level <batteryLevel>",
    "rover battery level",
    parseNumberOption,
  )
  .requiredOption("-s, --status <status>", "rover status")
  .action(
    async (
      name: string,
      options: { location: string; batteryLevel: number; status: string },
    ) => {
      try {
        const createdRover = await createRover({
          name,
          location: options.location,
          batteryLevel: options.batteryLevel,
          status: options.status,
        });

        console.log(`Created rover '${createdRover.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

rover
  .command("list")
  .description("List rovers.")
  .action(async () => {
    try {
      const rovers = await listRovers();

      if (rovers.length === 0) {
        console.log("No rovers found.");
        return;
      }

      for (const rover of rovers) {
        console.log(
          `${rover.name}\t${rover.status}\t${rover.location}\tbattery=${rover.batteryLevel}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

rover
  .command("show")
  .description("Show one rover.")
  .argument("<name>", "rover name")
  .action(async (name: string) => {
    try {
      const rover = await showRover(name);

      console.log(`Name: ${rover.name}`);
      console.log(`Location: ${rover.location}`);
      console.log(`Battery level: ${rover.batteryLevel}`);
      console.log(`Status: ${rover.status}`);
    } catch (error) {
      reportError(error);
    }
  });

rover
  .command("update")
  .description("Update a rover.")
  .argument("<name>", "rover name")
  .option("-n, --name <name>", "new rover name")
  .option("-l, --location <location>", "new rover location")
  .option(
    "-b, --battery-level <batteryLevel>",
    "new rover battery level",
    parseNumberOption,
  )
  .option("-s, --status <status>", "new rover status")
  .action(
    async (
      name: string,
      options: {
        name?: string;
        location?: string;
        batteryLevel?: number;
        status?: string;
      },
    ) => {
      try {
        const updatedRover = await updateRover(name, options);

        console.log(`Updated rover '${updatedRover.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

rover
  .command("delete")
  .description("Delete a rover.")
  .argument("<name>", "rover name")
  .action(async (name: string) => {
    try {
      await deleteRover(name);

      console.log(`Deleted rover '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

const greenhouse = program
  .command("greenhouse")
  .description("Manage habitat greenhouses.");

greenhouse.addHelpText(
  "after",
  `
Fields:
  name string, crop string, temperature number, status string

List output:
  <name> <status> <crop> temperature=<number>

Examples:
  habitat greenhouse create hydroponics --crop lettuce --temperature 22.5 --status growing
  habitat greenhouse list
  habitat greenhouse show hydroponics
  habitat greenhouse update hydroponics --temperature 23 --status harvest-ready
  habitat greenhouse delete hydroponics
`,
);

greenhouse
  .command("create")
  .description("Create a greenhouse.")
  .argument("<name>", "greenhouse name")
  .requiredOption("-c, --crop <crop>", "greenhouse crop")
  .requiredOption(
    "-t, --temperature <temperature>",
    "greenhouse temperature",
    parseNumberOption,
  )
  .requiredOption("-s, --status <status>", "greenhouse status")
  .action(
    async (
      name: string,
      options: { crop: string; temperature: number; status: string },
    ) => {
      try {
        const createdGreenhouse = await createGreenhouse({
          name,
          crop: options.crop,
          temperature: options.temperature,
          status: options.status,
        });

        console.log(`Created greenhouse '${createdGreenhouse.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

greenhouse
  .command("list")
  .description("List greenhouses.")
  .action(async () => {
    try {
      const greenhouses = await listGreenhouses();

      if (greenhouses.length === 0) {
        console.log("No greenhouses found.");
        return;
      }

      for (const greenhouse of greenhouses) {
        console.log(
          `${greenhouse.name}\t${greenhouse.status}\t${greenhouse.crop}\ttemperature=${greenhouse.temperature}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

greenhouse
  .command("show")
  .description("Show one greenhouse.")
  .argument("<name>", "greenhouse name")
  .action(async (name: string) => {
    try {
      const greenhouse = await showGreenhouse(name);

      console.log(`Name: ${greenhouse.name}`);
      console.log(`Crop: ${greenhouse.crop}`);
      console.log(`Temperature: ${greenhouse.temperature}`);
      console.log(`Status: ${greenhouse.status}`);
    } catch (error) {
      reportError(error);
    }
  });

greenhouse
  .command("update")
  .description("Update a greenhouse.")
  .argument("<name>", "greenhouse name")
  .option("-n, --name <name>", "new greenhouse name")
  .option("-c, --crop <crop>", "new greenhouse crop")
  .option(
    "-t, --temperature <temperature>",
    "new greenhouse temperature",
    parseNumberOption,
  )
  .option("-s, --status <status>", "new greenhouse status")
  .action(
    async (
      name: string,
      options: {
        name?: string;
        crop?: string;
        temperature?: number;
        status?: string;
      },
    ) => {
      try {
        const updatedGreenhouse = await updateGreenhouse(name, options);

        console.log(`Updated greenhouse '${updatedGreenhouse.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

greenhouse
  .command("delete")
  .description("Delete a greenhouse.")
  .argument("<name>", "greenhouse name")
  .action(async (name: string) => {
    try {
      await deleteGreenhouse(name);

      console.log(`Deleted greenhouse '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

const airlock = program
  .command("airlock")
  .description("Manage habitat airlocks.");

airlock.addHelpText(
  "after",
  `
Fields:
  name string, pressureLevel number, locked boolean, doorNames string[]

List output:
  <name> pressure=<number> locked=<true|false> doors=<count>

Relationship:
  habitat airlock add-door <airlockName> <doorName>

Examples:
  habitat airlock create main-airlock --pressure-level 1 --locked true
  habitat airlock list
  habitat airlock show main-airlock
  habitat airlock update main-airlock --pressure-level 2 --locked false
  habitat airlock delete main-airlock
  habitat airlock add-door main-airlock inner-door
`,
);


airlock
  .command("create")
  .description("Create an airlock.")
  .argument("<name>", "airlock name")
  .requiredOption(
    "-p, --pressure-level <pressureLevel>",
    "airlock pressure level",
    parseNumberOption,
  )
  .requiredOption(
    "-l, --locked <locked>",
    "whether the airlock is locked",
    parseBooleanOption,
  )
  .action(
    async (
      name: string,
      options: { pressureLevel: number; locked: boolean },
    ) => {
      try {
        const createdAirlock = await createAirlock({
          name,
          pressureLevel: options.pressureLevel,
          locked: options.locked,
        });

        console.log(`Created airlock '${createdAirlock.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

airlock
  .command("list")
  .description("List airlocks.")
  .action(async () => {
    try {
      const airlocks = await listAirlocks();

      if (airlocks.length === 0) {
        console.log("No airlocks found.");
        return;
      }

      for (const airlock of airlocks) {
        console.log(
          `${airlock.name}\tpressure=${airlock.pressureLevel}\tlocked=${airlock.locked}\tdoors=${airlock.doorNames.length}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

airlock
  .command("show")
  .description("Show one airlock.")
  .argument("<name>", "airlock name")
  .action(async (name: string) => {
    try {
      const { airlock, doors } = await showAirlock(name);

      console.log(`Name: ${airlock.name}`);
      console.log(`Pressure level: ${airlock.pressureLevel}`);
      console.log(`Locked: ${airlock.locked}`);
      console.log("Doors:");

      if (doors.length === 0) {
        console.log("  none");
        return;
      }

      for (const door of doors) {
        console.log(`  - ${door.name} (${door.status}, locked=${door.locked})`);
      }
    } catch (error) {
      reportError(error);
    }
  });

airlock
  .command("update")
  .description("Update an airlock.")
  .argument("<name>", "airlock name")
  .option("-n, --name <name>", "new airlock name")
  .option(
    "-p, --pressure-level <pressureLevel>",
    "new airlock pressure level",
    parseNumberOption,
  )
  .option(
    "-l, --locked <locked>",
    "whether the airlock is locked",
    parseBooleanOption,
  )
  .action(
    async (
      name: string,
      options: { name?: string; pressureLevel?: number; locked?: boolean },
    ) => {
      try {
        const updatedAirlock = await updateAirlock(name, options);

        console.log(`Updated airlock '${updatedAirlock.name}'.`);
      } catch (error) {
        reportError(error);
      }
    },
  );

airlock
  .command("delete")
  .description("Delete an airlock.")
  .argument("<name>", "airlock name")
  .action(async (name: string) => {
    try {
      await deleteAirlock(name);

      console.log(`Deleted airlock '${name}'.`);
    } catch (error) {
      reportError(error);
    }
  });

airlock
  .command("add-door")
  .description("Attach a door to an airlock.")
  .argument("<airlockName>", "airlock name")
  .argument("<doorName>", "door name")
  .action(async (airlockName: string, doorName: string) => {
    try {
      await addDoorToAirlock(airlockName, doorName);

      console.log(`Attached door '${doorName}' to airlock '${airlockName}'.`);
    } catch (error) {
      reportError(error);
    }
  });

await program.parseAsync();

function reportError(error: unknown): void {
  program.error(error instanceof Error ? error.message : String(error));
}

function parseBooleanOption(value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("Use true or false.");
}

function parseNumberOption(value: string): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error("Use a finite number.");
  }

  return number;
}
