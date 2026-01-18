import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex } from "../lib/index.js";

export const registerStatus = (program: Command): void => {
  program
    .command("status")
    .option("--json", "JSON output")
    .action(async (options) => {
      const index = await loadIndex();
      const outdated: string[] = [];
      const upToDate: string[] = index.skills.map((skill) => skill.name);

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "status",
          data: {
            outdated,
            upToDate
          }
        });
        return;
      }

      printInfo(`Outdated: ${outdated.length}`);
      printInfo(`Up to date: ${upToDate.length}`);
    });
};
