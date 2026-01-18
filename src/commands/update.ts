import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export const registerUpdate = (program: Command): void => {
  program
    .command("update")
    .argument("[name]", "Skill name")
    .option("--system", "Allow system-scope updates")
    .option("--json", "JSON output")
    .action((name, options) => {
      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "update",
          data: {
            name: name ?? null,
            system: Boolean(options.system),
            updated: []
          }
        });
        return;
      }

      printInfo("Skillbox update is not implemented yet.");
      if (name) {
        printInfo(`Skill: ${name}`);
      }
      if (options.system) {
        printInfo("System scope enabled");
      }
    });
};
