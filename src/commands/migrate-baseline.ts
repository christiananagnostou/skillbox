import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { migrateBaselines } from "../lib/baseline-migration.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export function registerMigrateBaseline(program: Command): void {
  program
    .command("migrate-baseline")
    .description(
      "Record verified upstream baselines for legacy installs without changing skill content"
    )
    .argument("[name]", "Skill name; defaults to all installed remote skills")
    .option("--dry-run", "Compare with upstream without writing baselines")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const results = await migrateBaselines({ name, dryRun: options.dryRun });
        const failed = results.filter((result) => result.status === "failed").length;
        if (failed) process.exitCode = 1;
        if (isJsonEnabled(options))
          printJson({
            ok: failed === 0,
            command: "migrate-baseline",
            ...(failed ? { error: { message: `${failed} baseline migrations failed.` } } : {}),
            data: { dryRun: Boolean(options.dryRun), results },
          });
        else
          for (const result of results)
            printInfo(`${result.name}: ${result.status} — ${result.error ?? result.reason ?? ""}`);
      } catch (error) {
        handleCommandError(options, "migrate-baseline", error);
      }
    });
}
