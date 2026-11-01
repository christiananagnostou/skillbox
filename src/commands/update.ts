import type { Command } from "commander";
import path from "node:path";
import { handleCommandError } from "../lib/command.js";
import {
  isJsonEnabled,
  printFailure,
  printInfo,
  printJson,
  printSkipped,
  printSuccess,
} from "../lib/output.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";
import { runUpdates } from "../lib/update-engine.js";

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .argument("[name]", "Skill name")
    .option("--project <path>", "Update project skills (shared canonical skills are skipped)")
    .option("--dry-run", "Report eligibility without downloading or changing skills")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const projectRoot = options.project ? path.resolve(options.project) : null;
        const summary = await runUpdates({
          name,
          projectRoot,
          dryRun: options.dryRun,
          onResult: isJsonEnabled(options)
            ? undefined
            : (result) => {
                if (result.status === "updated") printSuccess(result.name);
                else if (result.status === "failed")
                  printFailure(result.name, result.error ?? "unknown error");
                else
                  printSkipped(
                    result.name,
                    result.reason === "local source" ? "skipped" : (result.reason ?? "skipped")
                  );
              },
        });
        if (summary.failed) process.exitCode = 1;
        if (isJsonEnabled(options)) {
          const bySource = groupAndSort(
            summary.results,
            (result) => result.source,
            ["url", "git", "local"],
            sortByName
          ).map(({ key, items }) => ({
            source: key,
            results: items,
            updatedCount: items.filter((result) => result.status === "updated").length,
            failedCount: items.filter((result) => result.status === "failed").length,
          }));
          printJson({
            ok: summary.failed === 0,
            command: "update",
            ...(summary.failed
              ? { error: { message: `${summary.failed} skill update(s) failed.` } }
              : {}),
            data: {
              name: name ?? null,
              project: projectRoot,
              dryRun: Boolean(options.dryRun),
              ...summary,
              bySource,
            },
          });
          return;
        }
        printInfo(`Updating ${summary.total} skill${summary.total === 1 ? "" : "s"}...`);
        if (!summary.total) printInfo("No skills to update.");
        else if (summary.results.every((result) => result.source === "local"))
          printInfo("No trackable skills to update.");
        else
          printInfo(
            `Updated ${summary.updated} of ${summary.total} skills (${summary.failed} failed, ${summary.skipped} skipped).`
          );
      } catch (error) {
        process.exitCode = 1;
        handleCommandError(options, "update", error);
      }
    });
}
