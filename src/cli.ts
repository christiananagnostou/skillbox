#!/usr/bin/env node
import { Command } from "commander";
import { registerAdd } from "./commands/add.js";
import { registerConvert } from "./commands/convert.js";
import { registerList } from "./commands/list.js";
import { registerStatus } from "./commands/status.js";
import { registerUpdate } from "./commands/update.js";
import { registerImport } from "./commands/import.js";
import { registerMeta } from "./commands/meta.js";
import { registerProject } from "./commands/project.js";
import { registerAgent } from "./commands/agent.js";
import { registerConfig } from "./commands/config.js";

const program = new Command();

program
  .name("skillbox")
  .description("Local-first, agent-agnostic skills manager")
  .version("0.1.0");

registerAdd(program);
registerConvert(program);
registerList(program);
registerStatus(program);
registerUpdate(program);
registerImport(program);
registerMeta(program);
registerProject(program);
registerAgent(program);
registerConfig(program);

program.parse();
