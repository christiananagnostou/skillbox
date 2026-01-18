import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex } from "../lib/index.js";

export const registerList = (program: Command): void => {
  program
    .command("list")
    .option("--group <group>", "Group by category, namespace, source, project")
    .option("--json", "JSON output")
    .action(async (options) => {
      const index = await loadIndex();
      const skills = index.skills;

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "list",
          data: {
            group: options.group ?? null,
            skills
          }
        });
        return;
      }

      printInfo(`Skills: ${skills.length}`);
      for (const skill of skills) {
        const source = skill.source.type;
        const namespace = skill.namespace ? ` (${skill.namespace})` : "";
        printInfo(`- ${skill.name}${namespace} [${source}]`);
      }
    });
};
