import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AlertValidationError,
  acknowledgeAlert,
  observeAlertSync,
  readAlertsSync,
  resolveAlertsSync,
  validateAgainstContract,
  writeAlertContractSync,
  type Alert,
} from "./alerts";

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "habitat-alerts-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

const observation = {
  code: "human-deployed",
  title: "Human outside the habitat",
  description: "Someone is on EVA.",
  severity: "info" as const,
  source: "eva",
  subject: { type: "human" as const, id: "human-2" },
};

test("observing a new condition opens one alert", () => {
  const alert = observeAlertSync(observation);

  expect(alert.status).toBe("open");
  expect(alert.occurrenceCount).toBe(1);
  expect(alert.openedAt).toBe(alert.lastObservedAt);
  expect(readAlertsSync()).toHaveLength(1);
});

test("observing the same condition again counts it instead of duplicating", () => {
  observeAlertSync(observation);
  observeAlertSync(observation);
  const third = observeAlertSync(observation);

  expect(readAlertsSync()).toHaveLength(1);
  expect(third.occurrenceCount).toBe(3);
});

test("the same code about a different subject is a different alert", () => {
  observeAlertSync(observation);
  observeAlertSync({
    ...observation,
    subject: { type: "human", id: "human-1" },
  });

  expect(readAlertsSync()).toHaveLength(2);
});

test("a habitat-wide alert omits the subject entirely", () => {
  const alert = observeAlertSync({
    code: "habitat-wide-thing",
    title: "Something habitat-wide",
    description: "No single module or human owns this.",
    severity: "warning",
    source: "habitat",
  });

  expect("subject" in alert).toBe(false);
});

test("re-observing an acknowledged alert does not reopen it", async () => {
  const opened = observeAlertSync(observation);
  await acknowledgeAlert(opened.id);

  const again = observeAlertSync(observation);

  expect(again.status).toBe("acknowledged");
  expect(again.occurrenceCount).toBe(2);
});

test("resolving closes the alert and a later observation opens a fresh one", () => {
  const opened = observeAlertSync(observation);

  expect(resolveAlertsSync(observation.code, observation.subject)).toBe(1);
  expect(readAlertsSync()[0]!.status).toBe("resolved");

  const reopened = observeAlertSync(observation);

  expect(reopened.id).not.toBe(opened.id);
  expect(reopened.status).toBe("open");
  expect(reopened.occurrenceCount).toBe(1);
  expect(readAlertsSync()).toHaveLength(2);
});

test("resolving a condition that is not raised reports that nothing changed", () => {
  expect(resolveAlertsSync("never-happened")).toBe(0);
});

test("acknowledging is idempotent and keeps the first acknowledgement time", async () => {
  const opened = observeAlertSync(observation);
  const first = await acknowledgeAlert(opened.id);
  const second = await acknowledgeAlert(opened.id);

  expect(second.acknowledgedAt).toBe(first.acknowledgedAt!);
});

test("a resolved alert cannot be acknowledged", async () => {
  const opened = observeAlertSync(observation);
  resolveAlertsSync(observation.code, observation.subject);

  expect(acknowledgeAlert(opened.id)).rejects.toThrow(AlertValidationError);
});

test("acknowledging an unknown alert reports it was not found", () => {
  expect(acknowledgeAlert("no-such-alert")).rejects.toThrow("was not found");
});

// The registered contract, not a copy of it, is what alerts are checked against.
test("validation rejects an alert the registered contract forbids", () => {
  writeAlertContractSync({
    schemaVersion: "1.0",
    schema: {
      required: ["id", "code", "severity"],
      additionalProperties: false,
      properties: {
        id: {},
        code: {},
        severity: { enum: ["info", "warning", "critical"] },
      },
    },
  });

  const bogusSeverity = {
    id: "a",
    code: "b",
    severity: "catastrophic",
  } as unknown as Alert;

  expect(() => validateAgainstContract(bogusSeverity)).toThrow(
    AlertValidationError,
  );

  const missingCode = { id: "a", severity: "info" } as unknown as Alert;

  expect(() => validateAgainstContract(missingCode)).toThrow("missing 'code'");

  const extraField = {
    id: "a",
    code: "b",
    severity: "info",
    smuggled: true,
  } as unknown as Alert;

  expect(() => validateAgainstContract(extraField)).toThrow("'smuggled'");
});
