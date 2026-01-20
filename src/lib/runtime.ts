import type { AgentId } from "./agents.js";
import { loadConfig } from "./config.js";
import { resolveAgentList } from "./options.js";
import { findProjectRoot } from "./project-root.js";
import { findProject, loadProjects, saveProjects, upsertProject } from "./projects.js";
import type { ProjectEntry } from "./types.js";

export type ResolvedRuntime = {
  projectRoot: string;
  scope: "project" | "user";
  agentList: AgentId[];
};

export async function resolveRuntime(options: {
  global?: boolean;
  agents?: string;
}): Promise<ResolvedRuntime> {
  const projectRoot = await findProjectRoot(process.cwd());
  const config = await loadConfig();
  const scope = options.global ? "user" : (config.defaultScope ?? "project");
  const agentList = resolveAgentList(options.agents, config);

  return { projectRoot, scope, agentList };
}

export async function ensureProjectRegistered(
  projectRoot: string,
  scope: "project" | "user"
): Promise<ProjectEntry | undefined> {
  if (scope !== "project") {
    return undefined;
  }
  const projects = await loadProjects();
  const existing = findProject(projects, projectRoot);
  if (existing) {
    return existing;
  }
  const merged = upsertProject(projects, projectRoot);
  await saveProjects(merged);
  return findProject(merged, projectRoot);
}
