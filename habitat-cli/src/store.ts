import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Zone = {
  name: string;
  purpose: string;
  status: string;
};

export type Door = {
  name: string;
  status: string;
  locked: boolean;
};

export type Sensor = {
  name: string;
  type: string;
  reading: string;
  status: string;
};

export type Rover = {
  name: string;
  location: string;
  batteryLevel: number;
  status: string;
};

export type Greenhouse = {
  name: string;
  crop: string;
  temperature: number;
  status: string;
};

export type Airlock = {
  name: string;
  pressureLevel: number;
  locked: boolean;
  doorNames: string[];
};

type HabitatData = {
  zones: Zone[];
  doors: Door[];
  sensors: Sensor[];
  rovers: Rover[];
  greenhouses: Greenhouse[];
  airlocks: Airlock[];
};

export type HabitatStatus = {
  zones: number;
  doors: number;
  airlocks: number;
  sensors: number;
  rovers: number;
  greenhouses: number;
  total: number;
};

export const habitatDataPath = join(process.cwd(), ".habitat", "habitat.json");

const legacyZonesPath = join(process.cwd(), ".habitat", "zones.json");

export async function createZone(input: Zone): Promise<Zone> {
  const zone = normalizeZone(input);
  const data = await readData();

  if (data.zones.some((existingZone) => existingZone.name === zone.name)) {
    throw new Error(`Zone '${zone.name}' already exists.`);
  }

  data.zones.push(zone);
  await writeData(data);

  return zone;
}

export async function listZones(): Promise<Zone[]> {
  const data = await readData();

  return data.zones.sort(sortByName);
}

export async function showZone(name: string): Promise<Zone> {
  const zone = (await readData()).zones.find(
    (candidate) => candidate.name === name,
  );

  if (zone === undefined) {
    throw new Error(`Zone '${name}' was not found.`);
  }

  return zone;
}

export async function updateZone(
  name: string,
  updates: Partial<Zone>,
): Promise<Zone> {
  const data = await readData();
  const index = data.zones.findIndex((zone) => zone.name === name);

  if (index === -1) {
    throw new Error(`Zone '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedZone = normalizeZone({
    ...data.zones[index],
    ...removeUndefined(updates),
  });

  if (
    updatedZone.name !== name &&
    data.zones.some((zone) => zone.name === updatedZone.name)
  ) {
    throw new Error(`Zone '${updatedZone.name}' already exists.`);
  }

  data.zones[index] = updatedZone;
  await writeData(data);

  return updatedZone;
}

export async function deleteZone(name: string): Promise<void> {
  const data = await readData();
  const nextZones = data.zones.filter((zone) => zone.name !== name);

  if (nextZones.length === data.zones.length) {
    throw new Error(`Zone '${name}' was not found.`);
  }

  data.zones = nextZones;
  await writeData(data);
}

export async function createDoor(input: Door): Promise<Door> {
  const door = normalizeDoor(input);
  const data = await readData();

  if (data.doors.some((existingDoor) => existingDoor.name === door.name)) {
    throw new Error(`Door '${door.name}' already exists.`);
  }

  data.doors.push(door);
  await writeData(data);

  return door;
}

export async function listDoors(): Promise<Door[]> {
  const data = await readData();

  return data.doors.sort(sortByName);
}

export async function showDoor(name: string): Promise<Door> {
  const door = (await readData()).doors.find(
    (candidate) => candidate.name === name,
  );

  if (door === undefined) {
    throw new Error(`Door '${name}' was not found.`);
  }

  return door;
}

export async function updateDoor(
  name: string,
  updates: Partial<Door>,
): Promise<Door> {
  const data = await readData();
  const index = data.doors.findIndex((door) => door.name === name);

  if (index === -1) {
    throw new Error(`Door '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedDoor = normalizeDoor({
    ...data.doors[index],
    ...removeUndefined(updates),
  });

  if (
    updatedDoor.name !== name &&
    data.doors.some((door) => door.name === updatedDoor.name)
  ) {
    throw new Error(`Door '${updatedDoor.name}' already exists.`);
  }

  data.doors[index] = updatedDoor;

  if (updatedDoor.name !== name) {
    for (const airlock of data.airlocks) {
      airlock.doorNames = airlock.doorNames.map((doorName) =>
        doorName === name ? updatedDoor.name : doorName,
      );
    }
  }

  await writeData(data);

  return updatedDoor;
}

export async function deleteDoor(name: string): Promise<void> {
  const data = await readData();
  const nextDoors = data.doors.filter((door) => door.name !== name);

  if (nextDoors.length === data.doors.length) {
    throw new Error(`Door '${name}' was not found.`);
  }

  data.doors = nextDoors;

  for (const airlock of data.airlocks) {
    airlock.doorNames = airlock.doorNames.filter(
      (doorName) => doorName !== name,
    );
  }

  await writeData(data);
}

export async function createSensor(input: Sensor): Promise<Sensor> {
  const sensor = normalizeSensor(input);
  const data = await readData();

  if (
    data.sensors.some((existingSensor) => existingSensor.name === sensor.name)
  ) {
    throw new Error(`Sensor '${sensor.name}' already exists.`);
  }

  data.sensors.push(sensor);
  await writeData(data);

  return sensor;
}

export async function listSensors(): Promise<Sensor[]> {
  const data = await readData();

  return data.sensors.sort(sortByName);
}

export async function showSensor(name: string): Promise<Sensor> {
  const sensor = (await readData()).sensors.find(
    (candidate) => candidate.name === name,
  );

  if (sensor === undefined) {
    throw new Error(`Sensor '${name}' was not found.`);
  }

  return sensor;
}

export async function updateSensor(
  name: string,
  updates: Partial<Sensor>,
): Promise<Sensor> {
  const data = await readData();
  const index = data.sensors.findIndex((sensor) => sensor.name === name);

  if (index === -1) {
    throw new Error(`Sensor '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedSensor = normalizeSensor({
    ...data.sensors[index],
    ...removeUndefined(updates),
  });

  if (
    updatedSensor.name !== name &&
    data.sensors.some((sensor) => sensor.name === updatedSensor.name)
  ) {
    throw new Error(`Sensor '${updatedSensor.name}' already exists.`);
  }

  data.sensors[index] = updatedSensor;
  await writeData(data);

  return updatedSensor;
}

export async function deleteSensor(name: string): Promise<void> {
  const data = await readData();
  const nextSensors = data.sensors.filter((sensor) => sensor.name !== name);

  if (nextSensors.length === data.sensors.length) {
    throw new Error(`Sensor '${name}' was not found.`);
  }

  data.sensors = nextSensors;
  await writeData(data);
}

export async function createRover(input: Rover): Promise<Rover> {
  const rover = normalizeRover(input);
  const data = await readData();

  if (data.rovers.some((existingRover) => existingRover.name === rover.name)) {
    throw new Error(`Rover '${rover.name}' already exists.`);
  }

  data.rovers.push(rover);
  await writeData(data);

  return rover;
}

export async function listRovers(): Promise<Rover[]> {
  const data = await readData();

  return data.rovers.sort(sortByName);
}

export async function showRover(name: string): Promise<Rover> {
  const rover = (await readData()).rovers.find(
    (candidate) => candidate.name === name,
  );

  if (rover === undefined) {
    throw new Error(`Rover '${name}' was not found.`);
  }

  return rover;
}

export async function updateRover(
  name: string,
  updates: Partial<Rover>,
): Promise<Rover> {
  const data = await readData();
  const index = data.rovers.findIndex((rover) => rover.name === name);

  if (index === -1) {
    throw new Error(`Rover '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedRover = normalizeRover({
    ...data.rovers[index],
    ...removeUndefined(updates),
  });

  if (
    updatedRover.name !== name &&
    data.rovers.some((rover) => rover.name === updatedRover.name)
  ) {
    throw new Error(`Rover '${updatedRover.name}' already exists.`);
  }

  data.rovers[index] = updatedRover;
  await writeData(data);

  return updatedRover;
}

export async function deleteRover(name: string): Promise<void> {
  const data = await readData();
  const nextRovers = data.rovers.filter((rover) => rover.name !== name);

  if (nextRovers.length === data.rovers.length) {
    throw new Error(`Rover '${name}' was not found.`);
  }

  data.rovers = nextRovers;
  await writeData(data);
}

export async function createGreenhouse(
  input: Greenhouse,
): Promise<Greenhouse> {
  const greenhouse = normalizeGreenhouse(input);
  const data = await readData();

  if (
    data.greenhouses.some(
      (existingGreenhouse) => existingGreenhouse.name === greenhouse.name,
    )
  ) {
    throw new Error(`Greenhouse '${greenhouse.name}' already exists.`);
  }

  data.greenhouses.push(greenhouse);
  await writeData(data);

  return greenhouse;
}

export async function listGreenhouses(): Promise<Greenhouse[]> {
  const data = await readData();

  return data.greenhouses.sort(sortByName);
}

export async function showGreenhouse(name: string): Promise<Greenhouse> {
  const greenhouse = (await readData()).greenhouses.find(
    (candidate) => candidate.name === name,
  );

  if (greenhouse === undefined) {
    throw new Error(`Greenhouse '${name}' was not found.`);
  }

  return greenhouse;
}

export async function updateGreenhouse(
  name: string,
  updates: Partial<Greenhouse>,
): Promise<Greenhouse> {
  const data = await readData();
  const index = data.greenhouses.findIndex(
    (greenhouse) => greenhouse.name === name,
  );

  if (index === -1) {
    throw new Error(`Greenhouse '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedGreenhouse = normalizeGreenhouse({
    ...data.greenhouses[index],
    ...removeUndefined(updates),
  });

  if (
    updatedGreenhouse.name !== name &&
    data.greenhouses.some(
      (greenhouse) => greenhouse.name === updatedGreenhouse.name,
    )
  ) {
    throw new Error(`Greenhouse '${updatedGreenhouse.name}' already exists.`);
  }

  data.greenhouses[index] = updatedGreenhouse;
  await writeData(data);

  return updatedGreenhouse;
}

export async function deleteGreenhouse(name: string): Promise<void> {
  const data = await readData();
  const nextGreenhouses = data.greenhouses.filter(
    (greenhouse) => greenhouse.name !== name,
  );

  if (nextGreenhouses.length === data.greenhouses.length) {
    throw new Error(`Greenhouse '${name}' was not found.`);
  }

  data.greenhouses = nextGreenhouses;
  await writeData(data);
}

export async function getHabitatStatus(): Promise<HabitatStatus> {
  const data = await readData();
  const zones = data.zones.length;
  const doors = data.doors.length;
  const airlocks = data.airlocks.length;
  const sensors = data.sensors.length;
  const rovers = data.rovers.length;
  const greenhouses = data.greenhouses.length;

  return {
    zones,
    doors,
    airlocks,
    sensors,
    rovers,
    greenhouses,
    total: zones + doors + airlocks + sensors + rovers + greenhouses,
  };
}

export async function createAirlock(
  input: Omit<Airlock, "doorNames">,
): Promise<Airlock> {
  const airlock = normalizeAirlock({ ...input, doorNames: [] });
  const data = await readData();

  if (
    data.airlocks.some(
      (existingAirlock) => existingAirlock.name === airlock.name,
    )
  ) {
    throw new Error(`Airlock '${airlock.name}' already exists.`);
  }

  data.airlocks.push(airlock);
  await writeData(data);

  return airlock;
}

export async function listAirlocks(): Promise<Airlock[]> {
  const data = await readData();

  return data.airlocks.sort(sortByName);
}

export async function showAirlock(name: string): Promise<{
  airlock: Airlock;
  doors: Door[];
}> {
  const data = await readData();
  const airlock = data.airlocks.find((candidate) => candidate.name === name);

  if (airlock === undefined) {
    throw new Error(`Airlock '${name}' was not found.`);
  }

  const doors = airlock.doorNames
    .map((doorName) => data.doors.find((door) => door.name === doorName))
    .filter((door): door is Door => door !== undefined);

  return { airlock, doors };
}

export async function updateAirlock(
  name: string,
  updates: Partial<Omit<Airlock, "doorNames">>,
): Promise<Airlock> {
  const data = await readData();
  const index = data.airlocks.findIndex((airlock) => airlock.name === name);

  if (index === -1) {
    throw new Error(`Airlock '${name}' was not found.`);
  }

  if (!hasUpdates(updates)) {
    throw new Error("Provide at least one field to update.");
  }

  const updatedAirlock = normalizeAirlock({
    ...data.airlocks[index],
    ...removeUndefined(updates),
  });

  if (
    updatedAirlock.name !== name &&
    data.airlocks.some((airlock) => airlock.name === updatedAirlock.name)
  ) {
    throw new Error(`Airlock '${updatedAirlock.name}' already exists.`);
  }

  data.airlocks[index] = updatedAirlock;
  await writeData(data);

  return updatedAirlock;
}

export async function deleteAirlock(name: string): Promise<void> {
  const data = await readData();
  const nextAirlocks = data.airlocks.filter((airlock) => airlock.name !== name);

  if (nextAirlocks.length === data.airlocks.length) {
    throw new Error(`Airlock '${name}' was not found.`);
  }

  data.airlocks = nextAirlocks;
  await writeData(data);
}

export async function addDoorToAirlock(
  airlockName: string,
  doorName: string,
): Promise<Airlock> {
  const data = await readData();
  const airlock = data.airlocks.find(
    (candidate) => candidate.name === airlockName,
  );

  if (airlock === undefined) {
    throw new Error(`Airlock '${airlockName}' was not found.`);
  }

  if (!data.doors.some((door) => door.name === doorName)) {
    throw new Error(`Door '${doorName}' was not found.`);
  }

  if (!airlock.doorNames.includes(doorName)) {
    airlock.doorNames.push(doorName);
    airlock.doorNames.sort((left, right) => left.localeCompare(right));
    await writeData(data);
  }

  return airlock;
}

async function readData(): Promise<HabitatData> {
  const file = Bun.file(habitatDataPath);

  if (await file.exists()) {
    const contents = await file.text();

    if (contents.trim() === "") {
      return emptyData();
    }

    return normalizeData(JSON.parse(contents) as unknown);
  }

  return {
    zones: await readLegacyZones(),
    doors: [],
    sensors: [],
    rovers: [],
    greenhouses: [],
    airlocks: [],
  };
}

async function writeData(data: HabitatData): Promise<void> {
  await mkdir(dirname(habitatDataPath), { recursive: true });
  await Bun.write(habitatDataPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function readLegacyZones(): Promise<Zone[]> {
  const file = Bun.file(legacyZonesPath);

  if (!(await file.exists())) {
    return [];
  }

  const contents = await file.text();

  if (contents.trim() === "") {
    return [];
  }

  const parsed = JSON.parse(contents) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${legacyZonesPath} must contain a JSON array.`);
  }

  return parsed.map(readZone);
}

function emptyData(): HabitatData {
  return {
    zones: [],
    doors: [],
    sensors: [],
    rovers: [],
    greenhouses: [],
    airlocks: [],
  };
}

function normalizeData(value: unknown): HabitatData {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} must contain a JSON object.`);
  }

  const data = value as Record<string, unknown>;

  return {
    zones: readList(data.zones, "zones", readZone),
    doors: readList(data.doors, "doors", readDoor),
    sensors: readList(data.sensors, "sensors", readSensor),
    rovers: readList(data.rovers, "rovers", readRover),
    greenhouses: readList(data.greenhouses, "greenhouses", readGreenhouse),
    airlocks: readList(data.airlocks, "airlocks", readAirlock),
  };
}

function readList<T>(
  value: unknown,
  field: keyof HabitatData,
  readItem: (value: unknown) => T,
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${habitatDataPath} field '${field}' must be an array.`);
  }

  return value.map(readItem);
}

function readZone(value: unknown): Zone {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid zone.`);
  }

  const zone = value as Record<string, unknown>;

  return normalizeZone({
    name: readString(zone.name, "name"),
    purpose: readString(zone.purpose, "purpose"),
    status: readString(zone.status, "status"),
  });
}

function readDoor(value: unknown): Door {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid door.`);
  }

  const door = value as Record<string, unknown>;

  return normalizeDoor({
    name: readString(door.name, "name"),
    status: readString(door.status, "status"),
    locked: readBoolean(door.locked, "locked"),
  });
}

function readSensor(value: unknown): Sensor {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid sensor.`);
  }

  const sensor = value as Record<string, unknown>;

  return normalizeSensor({
    name: readString(sensor.name, "name"),
    type: readString(sensor.type, "type"),
    reading: readString(sensor.reading, "reading"),
    status: readString(sensor.status, "status"),
  });
}

function readRover(value: unknown): Rover {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid rover.`);
  }

  const rover = value as Record<string, unknown>;

  return normalizeRover({
    name: readString(rover.name, "name"),
    location: readString(rover.location, "location"),
    batteryLevel: readNumber(rover.batteryLevel, "batteryLevel"),
    status: readString(rover.status, "status"),
  });
}

function readGreenhouse(value: unknown): Greenhouse {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid greenhouse.`);
  }

  const greenhouse = value as Record<string, unknown>;

  return normalizeGreenhouse({
    name: readString(greenhouse.name, "name"),
    crop: readString(greenhouse.crop, "crop"),
    temperature: readNumber(greenhouse.temperature, "temperature"),
    status: readString(greenhouse.status, "status"),
  });
}

function readAirlock(value: unknown): Airlock {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${habitatDataPath} contains an invalid airlock.`);
  }

  const airlock = value as Record<string, unknown>;
  const doorNames = airlock.doorNames ?? [];

  if (!Array.isArray(doorNames)) {
    throw new Error("Airlock doorNames must be an array.");
  }

  return normalizeAirlock({
    name: readString(airlock.name, "name"),
    pressureLevel: readNumber(airlock.pressureLevel, "pressureLevel"),
    locked: readBoolean(airlock.locked, "locked"),
    doorNames: doorNames.map((doorName) => readString(doorName, "doorNames")),
  });
}

function normalizeZone(zone: Zone): Zone {
  return {
    name: readString(zone.name, "name"),
    purpose: readString(zone.purpose, "purpose"),
    status: readString(zone.status, "status"),
  };
}

function normalizeDoor(door: Door): Door {
  return {
    name: readString(door.name, "name"),
    status: readString(door.status, "status"),
    locked: readBoolean(door.locked, "locked"),
  };
}

function normalizeSensor(sensor: Sensor): Sensor {
  return {
    name: readString(sensor.name, "name"),
    type: readString(sensor.type, "type"),
    reading: readString(sensor.reading, "reading"),
    status: readString(sensor.status, "status"),
  };
}

function normalizeRover(rover: Rover): Rover {
  return {
    name: readString(rover.name, "name"),
    location: readString(rover.location, "location"),
    batteryLevel: readNumber(rover.batteryLevel, "batteryLevel"),
    status: readString(rover.status, "status"),
  };
}

function normalizeGreenhouse(greenhouse: Greenhouse): Greenhouse {
  return {
    name: readString(greenhouse.name, "name"),
    crop: readString(greenhouse.crop, "crop"),
    temperature: readNumber(greenhouse.temperature, "temperature"),
    status: readString(greenhouse.status, "status"),
  };
}

function normalizeAirlock(airlock: Airlock): Airlock {
  return {
    name: readString(airlock.name, "name"),
    pressureLevel: readNumber(airlock.pressureLevel, "pressureLevel"),
    locked: readBoolean(airlock.locked, "locked"),
    doorNames: [
      ...new Set(
        airlock.doorNames.map((name) => readString(name, "doorNames")),
      ),
    ],
  };
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be true or false.`);
  }

  return value;
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }

  return value;
}

function hasUpdates(updates: object): boolean {
  return Object.values(updates).some((value) => value !== undefined);
}

function removeUndefined<T extends object>(updates: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function sortByName<T extends { name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name);
}
