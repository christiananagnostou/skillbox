import { detectAgents } from "./agent-detect.js";
import { allAgents } from "./agents.js";
import { loadConfig, saveConfig } from "./config.js";
import { printInfo } from "./output.js";

function printWelcome(): void {
  printInfo("");
  printInfo("Welcome to Skillbox");
  printInfo("Local-first, agent-agnostic skills manager");
  printInfo("");
}

function printDetectedAgents(agents: string[]): void {
  if (agents.length === 0) {
    printInfo("No agents detected. Using all supported agents:");
    for (const agent of allAgents) {
      printInfo(`  - ${agent}`);
    }
  } else {
    printInfo("Detected agents:");
    for (const agent of agents) {
      printInfo(`  ✓ ${agent}`);
    }
  }
  printInfo("");
  printInfo("Run 'skillbox config set --add-agent <name>' to add more agents.");
  printInfo("");
}

export async function runOnboarding(): Promise<void> {
  const config = await loadConfig();
  if (config.defaultAgents.length > 0) {
    return;
  }

  const detected = await detectAgents();
  const selected = detected.length > 0 ? detected : allAgents;

  printWelcome();
  printDetectedAgents(detected);

  await saveConfig({ ...config, defaultAgents: selected });
}
