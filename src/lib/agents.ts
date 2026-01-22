import os from "node:os";
import path from "node:path";

export type AgentId = "opencode" | "claude" | "cursor" | "codex" | "amp" | "antigravity";

export type AgentPathMap = {
  user: string[];
  project: string[];
};

const home = os.homedir();

export const allAgents: AgentId[] = ["opencode", "claude", "cursor", "codex", "amp", "antigravity"];

const agentSet = new Set<string>(allAgents);

export function agentPaths(projectRoot: string): Record<AgentId, AgentPathMap> {
  return {
    opencode: {
      project: [
        path.join(projectRoot, ".opencode", "skills"),
        path.join(projectRoot, ".claude", "skills"),
      ],
      user: [
        path.join(home, ".config", "opencode", "skills"),
        path.join(home, ".claude", "skills"),
      ],
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
  };
}

export function getUserAgentPaths(projectRoot: string): string[] {
  const paths = agentPaths(projectRoot);
  return Object.values(paths).flatMap((entry) => entry.user);
}

export type AgentPath = {
  agent: AgentId;
  path: string;
};

export function getUserPathsForAgents(projectRoot: string, agents: AgentId[]): AgentPath[] {
  return getPathsForAgents(projectRoot, agents, "user");
}

export function getProjectPathsForAgents(projectRoot: string, agents: AgentId[]): AgentPath[] {
  return getPathsForAgents(projectRoot, agents, "project");
}

function getPathsForAgents(
  projectRoot: string,
  agents: AgentId[],
  scope: "user" | "project"
): AgentPath[] {
  const paths = agentPaths(projectRoot);
  const seen = new Set<string>();
  const results: AgentPath[] = [];

  for (const agent of agents) {
    const agentEntry = paths[agent];
    if (!agentEntry) {
      continue;
    }
    for (const pathValue of agentEntry[scope]) {
      if (seen.has(pathValue)) {
        continue;
      }
      seen.add(pathValue);
      results.push({ agent, path: pathValue });
    }
  }

  return results;
}

export function isAgentId(value: string): value is AgentId {
  return agentSet.has(value);
}
