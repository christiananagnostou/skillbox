import type { AgentId, AgentPathMap } from "./agents.js";
import { agentPaths } from "./agents.js";
import type { ProjectEntry } from "./types.js";

export type ProjectAgentPathMap = Record<AgentId, AgentPathMap>;

export function buildProjectAgentPaths(
  projectRoot: string,
  project?: ProjectEntry
): ProjectAgentPathMap {
  const defaults = agentPaths(projectRoot);
  if (!project?.agentPaths) {
    return defaults;
  }

  const merged = { ...defaults } as ProjectAgentPathMap;
  for (const [agent, paths] of Object.entries(project.agentPaths)) {
    if (!paths) {
      continue;
    }
    merged[agent as AgentId] = {
      ...defaults[agent as AgentId],
      project: paths,
    };
  }

  return merged;
}
