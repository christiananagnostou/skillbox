import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { loadConfig, saveConfig } from "../lib/config.js";
import { collect } from "../lib/fs-utils.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export function registerConfig(program: Command): void {
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
    .option("--add-agent <agent>", "Add to default agents", collect)
    .option("--default-scope <scope>", "Default scope: project or user")
    .option("--install-mode <mode>", "Install mode: symlink or copy")
    .option("--json", "JSON output")
    .action(async (options) => {
      try {
        const current = await loadConfig();
        const nextScope = options.defaultScope ?? current.defaultScope;
        if (nextScope !== "project" && nextScope !== "user") {
          throw new Error("defaultScope must be 'project' or 'user'.");
        }

        const nextMode = options.installMode ?? current.installMode;
        if (nextMode !== "symlink" && nextMode !== "copy") {
          throw new Error("installMode must be 'symlink' or 'copy'.");
        }

        const addedAgents = options.addAgent ?? [];
        const nextAgents = options.defaultAgent ?? current.defaultAgents;
        const mergedAgents = Array.from(
          new Set([...(nextAgents ?? []), ...addedAgents].filter((agent) => agent.length > 0))
        );

        const next = {
          ...current,
          defaultAgents: mergedAgents,
          defaultScope: nextScope,
          installMode: nextMode,
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
}
