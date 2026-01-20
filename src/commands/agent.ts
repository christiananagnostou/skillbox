import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

const AGENT_SNIPPET = `Use skillbox for skill management.

Common workflow:
1) skillbox list --json
2) skillbox status --json
3) skillbox update <name> --json

If you need to install a new skill from a URL, run:
skillbox add <url> [--name <name>]

If a URL is not a valid skill, run:
skillbox convert <url> --agent
`;

export function registerAgent(program: Command): void {
  program
    .command("agent")
    .description("Print agent-friendly usage")
    .option("--json", "JSON output")
    .action((options) => {
      if (isJsonEnabled(options)) {
        printJson({ ok: true, command: "agent", data: { snippet: AGENT_SNIPPET } });
        return;
      }
      printInfo(AGENT_SNIPPET);
    });
}
