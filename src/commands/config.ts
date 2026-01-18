import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadConfig, saveConfig } from "../lib/config.js";
import { handleCommandError } from "../lib/command.js";

const collect = (value: string, previous: string[] = []): string[] => {
  return [...previous, value];
};

export const registerConfig = (program: Command): void => {
  const config = program.command("config").description("View or edit skillbox config");

  config
    .command("get")
    .option("--json", "JSON output")
    .action(async (options) => {
      try {
        const current = await loadConfig();
        if (isJsonEnabled(options)) {
          printJson({ ok: true, command: "config get", data: current });
          return;
        }
        printInfo(JSON.stringify(current, null, 2));
      } catch (error) {
        handleCommandError(options, "config get", error);
      }
    });

  config
    .command("set")
    .option("--default-agent <agent>", "Default agent", collect)
    .option("--default-scope <scope>", "Default scope: project or user")
    .option("--manage-system", "Enable system scope operations")
    .option("--json", "JSON output")
    .action(async (options) => {
      try {
        const current = await loadConfig();
        const nextScope = options.defaultScope ?? current.defaultScope;
        if (nextScope !== "project" && nextScope !== "user") {
          throw new Error("defaultScope must be 'project' or 'user'.");
        }
        const next = {
          ...current,
          defaultAgents: options.defaultAgent ?? current.defaultAgents,
          defaultScope: nextScope,
          manageSystem: options.manageSystem ?? current.manageSystem
        };

        await saveConfig(next);

        if (isJsonEnabled(options)) {
          printJson({ ok: true, command: "config set", data: next });
          return;
        }

        printInfo("Config updated.");
      } catch (error) {
        handleCommandError(options, "config set", error);
      }
    });
};
