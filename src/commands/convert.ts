import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export const registerConvert = (program: Command): void => {
  program
    .command("convert")
    .argument("<url>", "Source URL to convert")
    .option("--agent", "Delegate conversion to agent")
    .option("--json", "JSON output")
    .action((url, options) => {
      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "convert",
          data: {
            url,
            agent: Boolean(options.agent)
          }
        });
        return;
      }

      printInfo("Skillbox convert is not implemented yet.");
      printInfo(`Requested URL: ${url}`);
      if (options.agent) {
        printInfo("Mode: agent conversion");
      }
    });
};
