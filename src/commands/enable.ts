import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { loadIndex, saveIndex, sortIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { installSkillToTargets } from "../lib/sync.js";

export function registerEnable(program: Command): void {
  program
    .command("enable")
    .argument("<name>", "Skill name")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const skill = index.skills.find((s) => s.name === name);

        if (!skill) {
          throw new Error(`Skill not found: ${name}`);
        }

        if (!skill.disabled) {
          throw new Error(`Skill is not disabled: ${name}`);
        }

        const installs = skill.installs ?? [];
        const targets = installs.map((i) => i.path);
        const config = await loadConfig();
        const results = await installSkillToTargets(name, targets, config);

        delete skill.disabled;
        await saveIndex(sortIndex(index));

        const installed = results.filter((r) => r.mode !== "skipped").length;

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "enable",
            data: {
              name,
              installed,
              results,
            },
          });
          return;
        }

        printInfo(`Enabled: ${name}`);
        if (installed > 0) {
          printInfo(`Restored to ${installed} install path(s)`);
        }
      } catch (error) {
        handleCommandError(options, "enable", error);
      }
    });
}
