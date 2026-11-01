#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
import { withMutationLock } from "./lib/mutation-lock.js";
import { handleCommandError } from "./lib/command.js";
import { registerAutoUpdate } from "./commands/auto-update.js";
import { registerAdd } from "./commands/add.js";
import { registerAgent } from "./commands/agent.js";
import { registerConfig } from "./commands/config.js";
import { registerConvert } from "./commands/convert.js";
import { registerDisable } from "./commands/disable.js";
import { registerEnable } from "./commands/enable.js";
import { registerImport } from "./commands/import.js";
import { registerList } from "./commands/list.js";
import { registerMigrateBaseline } from "./commands/migrate-baseline.js";
import { registerMeta } from "./commands/meta.js";
import { registerProject } from "./commands/project.js";
import { registerRemove } from "./commands/remove.js";
import { registerShow } from "./commands/show.js";
import { registerStatus } from "./commands/status.js";
import { registerUpdate } from "./commands/update.js";

const program = new Command();
program.exitOverride();

program.name("skillbox").description("Local-first, agent-agnostic skills manager").version(version);

registerAutoUpdate(program);
registerAdd(program);
registerAgent(program);
registerConfig(program);
registerConvert(program);
registerDisable(program);
registerEnable(program);
registerImport(program);
registerList(program);
registerMeta(program);
registerMigrateBaseline(program);
registerProject(program);
registerRemove(program);
registerShow(program);
registerStatus(program);
registerUpdate(program);

async function run(): Promise<void> {
  const { runOnboarding } = await import("./lib/onboarding.js");
  try {
    await withMutationLock(async () => {
      if (process.stdout.isTTY && !process.argv.includes("--json")) await runOnboarding();
      await program.parseAsync();
    });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    handleCommandError(
      { json: process.argv.includes("--json") },
      process.argv[2] ?? "skillbox",
      error
    );
  }
}

void run();
