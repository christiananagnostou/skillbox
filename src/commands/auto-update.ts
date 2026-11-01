import type { Command } from "commander";
import {
  autoUpdateStatus,
  disableAutoUpdate,
  enableAutoUpdate,
  loadAutoUpdateHistory,
  runAutoUpdate,
} from "../lib/auto-update.js";
import { handleCommandError } from "../lib/command.js";
import { collect } from "../lib/fs-utils.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export function registerAutoUpdate(program: Command): void {
  const group = program
    .command("auto-update")
    .description("Opt-in periodic updates of installed skills");
  function action(
    command: string,
    work: (options: Record<string, unknown>) => Promise<unknown>
  ): (options: Record<string, unknown>) => Promise<void> {
    return async (options) => {
      try {
        const data = await work(options);
        const ok = !(data && typeof data === "object" && "ok" in data && data.ok === false);
        if (!ok) process.exitCode = 1;
        if (isJsonEnabled(options))
          printJson({
            ok,
            command: `auto-update ${command}`,
            data,
            ...(!ok
              ? { error: { message: "One or more updates failed. See results and run history." } }
              : {}),
          });
        else printInfo(JSON.stringify(data, null, 2));
      } catch (error) {
        handleCommandError(options, `auto-update ${command}`, error);
      }
    };
  }
  group
    .command("enable")
    .description("Register a per-user native scheduler (default: 24h)")
    .option("--interval <interval>", "Interval in whole hours or days, minimum 1h")
    .option("--exclude <name>", "Exclude a skill (repeatable)", collect)
    .option("--pin <name>", "Keep a skill at its installed version (repeatable)", collect)
    .option("--json", "JSON output")
    .action(action("enable", enableAutoUpdate));
  group
    .command("disable")
    .description("Disable automatic execution and remove scheduler registration")
    .option("--json", "JSON output")
    .action(action("disable", disableAutoUpdate));
  group
    .command("status")
    .description("Show policy, native scheduler status and last run")
    .option("--json", "JSON output")
    .action(action("status", autoUpdateStatus));
  group
    .command("logs")
    .description("Show the last 50 update runs")
    .option("--json", "JSON output")
    .action(action("logs", loadAutoUpdateHistory));
  group
    .command("run")
    .description("Run the configured update policy once")
    .option("--dry-run", "Report eligibility without fetching or writing updates")
    .option("--scheduled", "Respect enabled state and elapsed interval")
    .option("--json", "JSON output")
    .action(action("run", runAutoUpdate));
  group
    .command("dry-run")
    .description("Preview policy eligibility without modifying skills")
    .option("--json", "JSON output")
    .action(action("dry-run", () => runAutoUpdate({ dryRun: true })));
}
