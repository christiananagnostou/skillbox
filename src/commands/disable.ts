import type { Command } from "commander";
import fs from "node:fs/promises";
import { handleCommandError } from "../lib/command.js";
import { loadIndex, saveIndex, sortIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export function registerDisable(program: Command): void {
  program
    .command("disable")
    .argument("<name>", "Skill name")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const skill = index.skills.find((s) => s.name === name);

        if (!skill) {
          throw new Error(`Skill not found: ${name}`);
        }

        if (skill.disabled) {
          throw new Error(`Skill already disabled: ${name}`);
        }

        const installs = skill.installs ?? [];
        const removed: string[] = [];

        for (const install of installs) {
          try {
            await fs.rm(install.path, { recursive: true, force: true });
            removed.push(install.path);
          } catch {
            // non-ENOENT errors (e.g. permission denied); skip silently
          }
        }

        skill.disabled = true;
        await saveIndex(sortIndex(index));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "disable",
            data: {
              name,
              removedPaths: removed,
              installs: installs.length,
            },
          });
          return;
        }

        printInfo(`Disabled: ${name}`);
        if (removed.length > 0) {
          printInfo(`Removed from ${removed.length} install path(s)`);
        }
      } catch (error) {
        handleCommandError(options, "disable", error);
      }
    });
}
