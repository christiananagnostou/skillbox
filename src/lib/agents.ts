import path from "node:path";
import os from "node:os";

export type AgentId = "opencode" | "claude" | "cursor" | "codex" | "amp" | "antigravity";

export type AgentPathMap = {
  user: string[];
  project: string[];
};

const home = os.homedir();

export const agentPaths = (projectRoot: string): Record<AgentId, AgentPathMap> => ({
  opencode: {
    project: [
      path.join(projectRoot, ".opencode", "skills"),
      path.join(projectRoot, ".claude", "skills"),
    ],
    user: [path.join(home, ".config", "opencode", "skills"), path.join(home, ".claude", "skills")],
  },
  claude: {
    project: [path.join(projectRoot, ".claude", "skills")],
    user: [path.join(home, ".claude", "skills")],
  },
  cursor: {
    project: [
      path.join(projectRoot, ".cursor", "skills"),
      path.join(projectRoot, ".claude", "skills"),
    ],
    user: [path.join(home, ".cursor", "skills"), path.join(home, ".claude", "skills")],
  },
  codex: {
    project: [path.join(projectRoot, ".codex", "skills")],
    user: [path.join(home, ".codex", "skills")],
  },
  amp: {
    project: [
      path.join(projectRoot, ".agents", "skills"),
      path.join(projectRoot, ".claude", "skills"),
    ],
    user: [path.join(home, ".config", "agents", "skills"), path.join(home, ".claude", "skills")],
  },
  antigravity: {
    project: [path.join(projectRoot, ".agent", "skills")],
    user: [path.join(home, ".gemini", "antigravity", "skills")],
  },
});

export const allAgents: AgentId[] = ["opencode", "claude", "cursor", "codex", "amp", "antigravity"];

export const getUserAgentPaths = (projectRoot: string): string[] => {
  const paths = agentPaths(projectRoot);
  return Object.values(paths).flatMap((entry) => entry.user);
};

const agentSet = new Set(allAgents);

export const isAgentId = (value: string): value is AgentId => {
  return agentSet.has(value as AgentId);
};
