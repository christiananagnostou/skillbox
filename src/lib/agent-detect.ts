import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { AgentId } from "./agents.js";

const home = os.homedir();

const agentRoots: Record<AgentId, string[]> = {
  opencode: [path.join(home, ".config", "opencode")],
  claude: [path.join(home, ".claude")],
  cursor: [path.join(home, ".cursor")],
  codex: [path.join(home, ".codex")],
  amp: [path.join(home, ".config", "agents")],
  antigravity: [path.join(home, ".gemini", "antigravity")],
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const detectAgents = async (): Promise<AgentId[]> => {
  const detected: AgentId[] = [];
  for (const [agent, roots] of Object.entries(agentRoots) as Array<[AgentId, string[]]>) {
    const matches = await Promise.all(roots.map((root) => exists(root)));
    if (matches.some(Boolean)) {
      detected.push(agent);
    }
  }
  return detected;
};
