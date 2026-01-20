#!/usr/bin/env node
import { Command } from "commander";
import { registerAdd } from "./commands/add.js";
import { registerAgent } from "./commands/agent.js";
import { registerConfig } from "./commands/config.js";
import { registerConvert } from "./commands/convert.js";
import { registerImport } from "./commands/import.js";
import { registerList } from "./commands/list.js";
import { registerMeta } from "./commands/meta.js";
import { registerProject } from "./commands/project.js";
import { registerRemove } from "./commands/remove.js";
import { registerStatus } from "./commands/status.js";
import { registerUpdate } from "./commands/update.js";

const program = new Command();

program.name("skillbox").description("Local-first, agent-agnostic skills manager").version("0.2.2");

registerAdd(program);
registerAgent(program);
registerConfig(program);
registerConvert(program);
registerImport(program);
registerList(program);
registerMeta(program);
registerProject(program);
registerRemove(program);
registerStatus(program);
registerUpdate(program);

async function run(): Promise<void> {
  const { runOnboarding } = await import("./lib/onboarding.js");
  await runOnboarding();
  program.parse();
}

void run();
