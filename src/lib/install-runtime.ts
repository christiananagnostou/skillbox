import { loadConfig } from "./config.js";
import { buildProjectAgentPaths } from "./project-paths.js";
import { ensureProjectRegistered, resolveRuntime } from "./runtime.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "./sync.js";
import type { SkillInstall } from "./types.js";

export type RuntimeInstallOptions = {
  global?: boolean;
  agents?: string;
};

export type RuntimeInstallResult = {
  installs: SkillInstall[];
  scope: "user" | "project";
  warnings: string[];
};

export async function installSkillToRuntime(
  skillName: string,
  options: RuntimeInstallOptions
): Promise<RuntimeInstallResult> {
  const { projectRoot, scope, agentList } = await resolveRuntime(options);
  const projectEntry = await ensureProjectRegistered(projectRoot, scope);
  const paths = buildProjectAgentPaths(projectRoot, projectEntry);
  const config = await loadConfig();
  const installs: SkillInstall[] = [];
  const recordedPaths = new Set<string>();
  const warnings: string[] = [];

  for (const agent of agentList) {
    const map = paths[agent];
    if (!map) {
      continue;
    }
    const targets = buildTargets(agent, map, scope).map((target) => target.path);
    const targetDirs = targets.map((target) => `${target}/${skillName}`);
    const dedupedTargets = targetDirs.filter((target) => !recordedPaths.has(target));

    if (dedupedTargets.length === 0) {
      continue;
    }

    const results = await installSkillToTargets(skillName, dedupedTargets, config);
    warnings.push(...buildSymlinkWarning(agent, results));

    if (dedupedTargets.length > 0) {
      for (const target of dedupedTargets) {
        recordedPaths.add(target);
        installs.push({
          scope,
          agent,
          path: target,
          projectRoot: scope === "project" ? projectRoot : undefined,
        });
      }
    }
  }

  return { installs, scope, warnings };
}
