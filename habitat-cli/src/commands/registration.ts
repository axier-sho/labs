import type { Command } from "commander";
import type { HabitatRecord, Registration } from "../kepler";
import type { HydrationSummary } from "../hydration";
import { apiBaseUrl, apiDelete, apiGet, apiPost } from "../api-client";
import { reportError } from "../cli";

// Registration now goes through the local Habitat backend over HTTP. The CLI no
// longer calls Kepler or writes SQLite directly — it asks the backend to do
// that and formats the structured JSON it gets back for humans.

type RegisterResult = {
  registration: Registration;
  // Null when this was an in-place upgrade of a legacy registration (no crew or
  // modules were re-hydrated — only the stream credentials were captured).
  summary: HydrationSummary | null;
  upgraded?: boolean;
};

type StatusResult = {
  registration: Registration | null;
  habitat: HabitatRecord | null;
  reachable: boolean;
  modules: number;
  error?: string;
};

// Reveal the saved live-clock stream credentials in the human-readable status.
// The stream API token is a live credential: it is shown here on purpose so the
// operator can inspect the contract, but it is never logged by the backend and
// never committed to Git. Do not screenshot or record this screen publicly.
function printStreamInfo(registration: Registration): void {
  if (registration.streamUrl === null || registration.streamApiToken === null) {
    console.log(
      "Stream credentials: none (legacy registration). " +
        "Re-run 'habitat register --name \"<same name>\"' to upgrade in place.",
    );
    return;
  }

  console.log(`Stream URL: ${registration.streamUrl}`);
  console.log(`Stream API token: ${registration.streamApiToken}`);

  const stream = registration.stream;
  if (stream !== null) {
    console.log(
      `Stream subscriptions: ${
        stream.subscriptions.length > 0 ? stream.subscriptions.join(", ") : "none"
      }`,
    );
    console.log(
      `Planet clock (at registration): tick ${stream.currentTick}, ` +
        `status ${stream.status}, ticksPerPulse ${stream.ticksPerPulse}` +
        (stream.tickIntervalMs > 0
          ? `, tickIntervalMs ${stream.tickIntervalMs}`
          : ""),
    );
  }
}

export function registerRegistrationCommands(program: Command): void {
  program
    .command("register")
    .description("Register this habitat with the Kepler planet server.")
    .requiredOption("-n, --name <name>", "habitat display name")
    .action(async (options: { name: string }) => {
      try {
        const result = await apiPost<RegisterResult>("/registration", {
          name: options.name,
        });
        const { registration, summary } = result;

        // An upgrade only captured stream credentials for an already-registered
        // habitat; the crew and modules were left untouched, so there is no
        // hydration summary to report.
        if (summary === null || result.upgraded === true) {
          console.log(
            `Upgraded habitat '${registration.displayName}' with Kepler stream credentials.`,
          );
          console.log(`Habitat ID: ${registration.habitatId}`);
          console.log(`Stream URL: ${registration.streamUrl ?? "none"}`);
          console.log(
            "Listening defaults to off. Run 'habitat status' to view the full stream token, " +
              "then 'habitat clock listen on' when you are ready to follow Kepler.",
          );
          console.log(`Saved registration via ${apiBaseUrl()}`);
          return;
        }

        console.log(`Registered habitat '${registration.displayName}' with Kepler.`);
        console.log(`Habitat ID: ${registration.habitatId}`);
        console.log(`Habitat UUID: ${registration.habitatUuid}`);
        console.log(`Starter modules hydrated: ${summary.modulesHydrated}`);
        console.log(`Starter humans hydrated: ${summary.humansHydrated}`);
        console.log(`Blueprints cached: ${summary.blueprintsCached}`);
        console.log(`Alert contract: v${summary.alertContractVersion}`);
        console.log("Listening to Kepler defaults to off (manual ticks).");
        console.log(`Saved registration via ${apiBaseUrl()}`);
      } catch (error) {
        reportError(program, error);
      }
    });

  program
    .command("status")
    .description("Show Kepler registration status for this habitat.")
    .option("--json", "print the complete JSON response")
    .action(async (options: { json?: boolean }) => {
      try {
        const status = await apiGet<StatusResult>("/status");

        // The --json output exposes the full registration record — stream URL and
        // token included — with stable field names for scripts and agents.
        if (options.json === true) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

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
          printStreamInfo(status.registration);
          return;
        }

        // Registered locally but the server was unreachable; show what we have.
        console.log("Registered: yes (local record only)");
        console.log(`Habitat ID: ${status.registration.habitatId}`);
        console.log(`Name: ${status.registration.displayName}`);
        console.log(`Modules: ${status.modules}`);
        printStreamInfo(status.registration);
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
