import { getDb } from "./db";
import type { AlertContract } from "./kepler";

// Alerts are habitat state. Kepler publishes the *definition* of an alert in
// contracts.alerts at registration and then stays out of it: opening,
// deduplicating, acknowledging and resolving are all local. Nothing here is
// pushed anywhere — a persisted alert is the foundation a dashboard or a
// notifier would later read.

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

// Habitat-wide alerts have no subject. When there is one it is the module or
// human the condition is about.
export type AlertSubject = {
  type: "module" | "human";
  id: string;
};

export type Alert = {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  subject?: AlertSubject;
  details?: Record<string, string | number | boolean>;
  openedAt: string;
  lastObservedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  occurrenceCount: number;
};

export class AlertValidationError extends Error {}

// The codes this habitat can raise. Kept together so the set of conditions the
// habitat knows how to complain about is readable in one place, and so a code
// is never spelled differently at the open site than at the resolve site.
export const ALERT_CODES = {
  humanDeployed: "human-deployed",
  carryCapacityReached: "eva-carry-capacity-reached",
  collectionRefused: "collection-refused",
} as const;

// --- The registered contract ---------------------------------------------

export function writeAlertContractSync(contract: AlertContract): void {
  getDb().run(
    "INSERT INTO alert_contract (id, schemaVersion, schema) VALUES (1, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "schemaVersion = excluded.schemaVersion, schema = excluded.schema",
    [contract.schemaVersion, JSON.stringify(contract.schema ?? {})],
  );
}

export function clearAlertContractSync(): void {
  getDb().run("DELETE FROM alert_contract");
}

export function readAlertContractSync(): AlertContract | null {
  const row = getDb()
    .query("SELECT schemaVersion, schema FROM alert_contract WHERE id = 1")
    .get() as { schemaVersion: string; schema: string } | null;

  if (row === null) {
    return null;
  }

  return {
    schemaVersion: row.schemaVersion,
    schema: JSON.parse(row.schema) as Record<string, unknown>,
  };
}

export async function readAlertContract(): Promise<AlertContract | null> {
  return readAlertContractSync();
}

// --- Reading -------------------------------------------------------------

export async function listAlerts(): Promise<Alert[]> {
  return readAlertsSync();
}

// Unresolved first, because those are the ones an operator has to do something
// about, and most recently seen first within each group.
export function readAlertsSync(): Alert[] {
  const rows = getDb()
    .query(
      "SELECT * FROM alerts ORDER BY " +
        "CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, " +
        "lastObservedAt DESC",
    )
    .all() as AlertRow[];

  return rows.map(rowToAlert);
}

export function readAlertSync(id: string): Alert | null {
  const row = getDb()
    .query("SELECT * FROM alerts WHERE id = ?")
    .get(id) as AlertRow | null;

  return row === null ? null : rowToAlert(row);
}

// --- Writing -------------------------------------------------------------

export type AlertObservation = {
  code: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  source: string;
  subject?: AlertSubject;
  details?: Record<string, string | number | boolean>;
};

// Record that a condition is true right now.
//
// Seeing the same unresolved condition again is not a new alert — it is the same
// problem, still happening. So this bumps lastObservedAt and occurrenceCount
// rather than inserting, and deliberately leaves `status` alone: an alert an
// operator already acknowledged must not silently reopen itself just because the
// condition was observed once more.
export function observeAlertSync(observation: AlertObservation): Alert {
  const now = new Date().toISOString();
  const existing = findUnresolvedSync(observation.code, observation.subject);

  if (existing !== null) {
    getDb().run(
      "UPDATE alerts SET lastObservedAt = ?, occurrenceCount = occurrenceCount + 1, " +
        "description = ?, details = ? WHERE id = ?",
      [
        now,
        observation.description,
        observation.details === undefined
          ? null
          : JSON.stringify(observation.details),
        existing.id,
      ],
    );

    return readAlertSync(existing.id)!;
  }

  const alert: Alert = {
    id: crypto.randomUUID(),
    code: observation.code,
    title: observation.title,
    description: observation.description,
    severity: observation.severity,
    status: "open",
    source: observation.source,
    ...(observation.subject === undefined ? {} : { subject: observation.subject }),
    ...(observation.details === undefined ? {} : { details: observation.details }),
    openedAt: now,
    lastObservedAt: now,
    occurrenceCount: 1,
  };

  validateAgainstContract(alert);
  insertAlertSync(alert);

  return alert;
}

// Mark a condition as no longer true. Returns how many alerts that closed, so
// callers can tell "the problem went away" from "there was no problem".
export function resolveAlertsSync(
  code: string,
  subject?: AlertSubject,
): number {
  const existing = findUnresolvedSync(code, subject);

  if (existing === null) {
    return 0;
  }

  getDb().run(
    "UPDATE alerts SET status = 'resolved', resolvedAt = ? WHERE id = ?",
    [new Date().toISOString(), existing.id],
  );

  return 1;
}

export async function acknowledgeAlert(id: string): Promise<Alert> {
  const alert = readAlertSync(id);

  if (alert === null) {
    throw new AlertValidationError(`Alert '${id}' was not found.`);
  }

  if (alert.status === "resolved") {
    throw new AlertValidationError(
      `Alert '${id}' is already resolved, so there is nothing to acknowledge.`,
    );
  }

  // Acknowledging twice is not an error: the operator's intent is already
  // recorded, and the first acknowledgement time is the true one.
  if (alert.status === "acknowledged") {
    return alert;
  }

  getDb().run(
    "UPDATE alerts SET status = 'acknowledged', acknowledgedAt = ? WHERE id = ?",
    [new Date().toISOString(), id],
  );

  return readAlertSync(id)!;
}

export function clearAlertsSync(): void {
  getDb().run("DELETE FROM alerts");
}

// --- Contract validation -------------------------------------------------

// Check an alert against the schema Kepler registered, rather than against a
// copy of it written here. This is deliberately not a general JSON Schema
// implementation — it checks the three things the contract actually constrains
// (required fields, the severity/status enums, and no extra properties), and
// reads all of them out of the stored schema so a contract change is caught
// instead of silently ignored.
export function validateAgainstContract(alert: Alert): void {
  const contract = readAlertContractSync();

  if (contract === null) {
    // Not registered yet, so there is no contract to check against. The database
    // CHECK constraints still apply.
    return;
  }

  const schema = contract.schema as {
    required?: unknown;
    properties?: Record<string, { enum?: unknown }>;
    additionalProperties?: unknown;
  };
  const serialized = alert as unknown as Record<string, unknown>;

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const field of required) {
    if (typeof field === "string" && serialized[field] === undefined) {
      throw new AlertValidationError(
        `Alert is missing '${field}', which contracts.alerts v${contract.schemaVersion} requires.`,
      );
    }
  }

  const properties = schema.properties ?? {};

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(serialized)) {
      if (!(key in properties)) {
        throw new AlertValidationError(
          `Alert has property '${key}', which contracts.alerts v${contract.schemaVersion} does not allow.`,
        );
      }
    }
  }

  for (const [key, definition] of Object.entries(properties)) {
    const allowed = definition?.enum;
    const value = serialized[key];

    if (
      Array.isArray(allowed) &&
      value !== undefined &&
      !allowed.includes(value)
    ) {
      throw new AlertValidationError(
        `Alert '${key}' is '${String(value)}', but contracts.alerts v${contract.schemaVersion} ` +
          `allows only: ${allowed.join(", ")}.`,
      );
    }
  }
}

// --- Persistence details -------------------------------------------------

type AlertRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  subjectType: "module" | "human" | null;
  subjectId: string | null;
  details: string | null;
  openedAt: string;
  lastObservedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  occurrenceCount: number;
};

function findUnresolvedSync(
  code: string,
  subject?: AlertSubject,
): Alert | null {
  const row = getDb()
    .query(
      "SELECT * FROM alerts WHERE code = ? AND status <> 'resolved' " +
        "AND IFNULL(subjectType, '') = ? AND IFNULL(subjectId, '') = ?",
    )
    .get(code, subject?.type ?? "", subject?.id ?? "") as AlertRow | null;

  return row === null ? null : rowToAlert(row);
}

function insertAlertSync(alert: Alert): void {
  getDb().run(
    "INSERT INTO alerts " +
      "(id, code, title, description, severity, status, source, subjectType, " +
      "subjectId, details, openedAt, lastObservedAt, acknowledgedAt, resolvedAt, " +
      "occurrenceCount) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      alert.id,
      alert.code,
      alert.title,
      alert.description,
      alert.severity,
      alert.status,
      alert.source,
      alert.subject?.type ?? null,
      alert.subject?.id ?? null,
      alert.details === undefined ? null : JSON.stringify(alert.details),
      alert.openedAt,
      alert.lastObservedAt,
      alert.acknowledgedAt ?? null,
      alert.resolvedAt ?? null,
      alert.occurrenceCount,
    ],
  );
}

// Optional fields are omitted rather than set to null: the contract forbids
// properties it does not list, and a null subject is not the same as no subject.
function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    source: row.source,
    ...(row.subjectType === null || row.subjectId === null
      ? {}
      : { subject: { type: row.subjectType, id: row.subjectId } }),
    ...(row.details === null
      ? {}
      : {
          details: JSON.parse(row.details) as Record<
            string,
            string | number | boolean
          >,
        }),
    openedAt: row.openedAt,
    lastObservedAt: row.lastObservedAt,
    ...(row.acknowledgedAt === null
      ? {}
      : { acknowledgedAt: row.acknowledgedAt }),
    ...(row.resolvedAt === null ? {} : { resolvedAt: row.resolvedAt }),
    occurrenceCount: row.occurrenceCount,
  };
}
