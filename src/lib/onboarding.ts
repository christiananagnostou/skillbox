import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { allAgents, isAgentId } from "./agents.js";
import { loadConfig, saveConfig } from "./config.js";

const promptAgents = async (): Promise<string[]> => {
  const rl = readline.createInterface({ input, output });
  const options = allAgents.join(", ");
  const answer = await rl.question(`Which agents do you use? (comma-separated) [${options}]: `);
  rl.close();

  const selected = answer
    .split(",")
    .map((agent) => agent.trim())
    .filter((agent) => agent.length > 0)
    .filter(isAgentId);

  return selected.length > 0 ? selected : allAgents;
};

export const runOnboarding = async (): Promise<void> => {
  const config = await loadConfig();
  if (config.defaultAgents.length > 0) {
    return;
  }

  const selected = await promptAgents();
  const next = {
    ...config,
    defaultAgents: selected,
  };
  await saveConfig(next);
};
