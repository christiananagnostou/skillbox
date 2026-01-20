import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { detectAgents } from "./agent-detect.js";
import { allAgents, isAgentId } from "./agents.js";
import { loadConfig, saveConfig } from "./config.js";

function formatPrompt(detected: string[]): string {
  if (detected.length === 0) {
    return `Which agents do you use? (comma-separated) [${allAgents.join(", ")}]: `;
  }
  return `Detected agents: ${detected.join(", ")}. Press enter to accept or edit: `;
}

async function promptAgents(): Promise<string[]> {
  const detected = await detectAgents();
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(formatPrompt(detected));
  rl.close();

  const raw = answer.trim().length > 0 ? answer : detected.join(",");
  const selected = raw
    .split(",")
    .map((agent) => agent.trim())
    .filter((agent) => agent.length > 0)
    .filter(isAgentId);

  if (selected.length > 0) {
    return selected;
  }

  return detected.length > 0 ? detected : allAgents;
}

export async function runOnboarding(): Promise<void> {
  const config = await loadConfig();
  if (config.defaultAgents.length > 0) {
    return;
  }

  const selected = await promptAgents();
  await saveConfig({ ...config, defaultAgents: selected });
}
