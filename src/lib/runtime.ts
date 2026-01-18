import type { AgentId } from "./agents.js";
import { allAgents } from "./agents.js";
import { loadConfig } from "./config.js";
import { findProjectRoot } from "./project-root.js";
import { loadProjects, findProject, saveProjects, upsertProject } from "./projects.js";

export type ResolvedRuntime = {
  projectRoot: string;
  scope: "project" | "user";
  agentList: AgentId[];
};

export const resolveRuntime = async (options: {
  global?: boolean;
  agents?: string;
}): Promise<ResolvedRuntime> => {
  const projectRoot = await findProjectRoot(process.cwd());
  const config = await loadConfig();
  const scope = options.global ? "user" : config.defaultScope ?? "project";
  const agentList: AgentId[] = options.agents
    ? options.agents.split(",").map((agent: string) => agent.trim() as AgentId).filter(Boolean)
    : config.defaultAgents.length > 0
      ? config.defaultAgents.map((agent) => agent as AgentId)
      : allAgents;

  return { projectRoot, scope, agentList };
};

export const ensureProjectRegistered = async (projectRoot: string, scope: "project" | "user") => {
  if (scope !== "project") {
    return undefined;
  }
  const projects = await loadProjects();
  let projectEntry = findProject(projects, projectRoot);
  if (!projectEntry) {
    const merged = upsertProject(projects, projectRoot);
    await saveProjects(merged);
    projectEntry = findProject(merged, projectRoot);
  }
  return projectEntry;
};
