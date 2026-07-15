import type { Command } from "commander";
import type { Alert } from "../alerts";
import { apiGet, apiPost } from "../api-client";
import { renderTable } from "../format";
import { reportError } from "../cli";

export function registerAlertCommands(program: Command): void {
  const alertCommand = program
    .command("alert")
    .description("Review the habitat's operational alerts.");

  alertCommand
    .command("list")
    .description("List persisted alerts and their statuses.")
    .option("--json", "print the complete JSON response")
    .action(async (options: { json?: boolean }) => {
      try {
        const { alerts } = await apiGet<{ alerts: Alert[] }>("/alerts");

        if (options.json === true) {
          console.log(JSON.stringify(alerts, null, 2));
          return;
        }

        printAlerts(alerts);
      } catch (error) {
        reportError(program, error);
      }
    });

  alertCommand
    .command("acknowledge")
    .description("Acknowledge one alert.")
    .argument("<alert-id>", "id of the alert to acknowledge")
    .action(async (alertId: string) => {
      try {
        const { alert } = await apiPost<{ alert: Alert }>(
          `/alerts/${encodeURIComponent(alertId)}/acknowledge`,
        );

        console.log(`Acknowledged: ${alert.title} (${alert.status}).`);
      } catch (error) {
        reportError(program, error);
      }
    });
}

function printAlerts(alerts: Alert[]): void {
  if (alerts.length === 0) {
    console.log("No alerts. Nothing has gone wrong yet.");
    return;
  }

  // The id column is wide, but it is printed in full because the next thing an
  // operator does is paste it into 'habitat alert acknowledge'.
  const rows = alerts.map((alert) => [
    alert.id,
    alert.severity,
    alert.status,
    alert.code,
    describeSubject(alert),
    String(alert.occurrenceCount),
    alert.lastObservedAt,
  ]);

  console.log(
    renderTable(
      ["Alert id", "Severity", "Status", "Code", "Subject", "Seen", "Last observed"],
      rows,
    ),
  );

  const open = alerts.filter((alert) => alert.status === "open").length;
  console.log("");
  console.log(
    `${alerts.length} alert(s), ${open} open. ` +
      "Acknowledge one with 'habitat alert acknowledge <alert-id>'.",
  );
}

// A habitat-wide alert has no subject, and saying so beats printing an empty
// cell that looks like missing data.
function describeSubject(alert: Alert): string {
  return alert.subject === undefined
    ? "habitat-wide"
    : `${alert.subject.type}:${alert.subject.id}`;
}
