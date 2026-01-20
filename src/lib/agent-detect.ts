import os from "node:os";
import path from "node:path";
import type { AgentId } from "./agents.js";
import { exists } from "./fs-utils.js";

const home = os.homedir();

const agentRoots: Record<AgentId, string[]> = {
  opencode: [path.join(home, ".config", "opencode")],
  claude: [path.join(home, ".claude")],
  cursor: [path.join(home, ".cursor")],
  codex: [path.join(home, ".codex")],
  amp: [path.join(home, ".config", "agents")],
  antigravity: [path.join(home, ".gemini", "antigravity")],
};

export async function detectAgents(): Promise<AgentId[]> {
  const detected: AgentId[] = [];
  for (const [agent, roots] of Object.entries(agentRoots) as Array<[AgentId, string[]]>) {
    const matches = await Promise.all(roots.map((root) => exists(root)));
    if (matches.some(Boolean)) {
      detected.push(agent);
    }
  }
  return detected;
}
