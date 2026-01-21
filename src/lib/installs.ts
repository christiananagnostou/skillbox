import type { IndexedSkill, SkillInstall } from "./types.js";

function isProjectInstall(
  install: SkillInstall
): install is SkillInstall & { projectRoot: string } {
  return install.scope === "project" && Boolean(install.projectRoot);
}

export function collectProjectSkills(skills: IndexedSkill[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    for (const install of skill.installs ?? []) {
      if (!isProjectInstall(install)) {
        continue;
      }
      const existing = map.get(install.projectRoot) ?? [];
      if (!existing.includes(skill.name)) {
        existing.push(skill.name);
        map.set(install.projectRoot, existing);
      }
    }
  }
  return map;
}

export function getProjectSkills(skills: IndexedSkill[], projectRoot: string): string[] {
  const map = collectProjectSkills(skills);
  return (map.get(projectRoot) ?? []).sort();
}

export function getInstallPaths(skill: IndexedSkill, projectRoot?: string | null): string[] {
  const installs = skill.installs ?? [];
  if (!projectRoot) {
    return installs.map((install) => install.path);
  }
  return installs
    .filter(isProjectInstall)
    .filter((install) => install.projectRoot === projectRoot)
    .map((install) => install.path);
}

export function recordInstallPaths(paths: string[], recorded: Set<string>): string[] {
  const deduped: string[] = [];
  for (const path of paths) {
    if (recorded.has(path)) {
      continue;
    }
    recorded.add(path);
    deduped.push(path);
  }
  return deduped;
}

export function getProjectInstallPaths(
  skills: IndexedSkill[],
  projectRoot: string
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const paths = getInstallPaths(skill, projectRoot);
    if (paths.length > 0) {
      map.set(skill.name, paths);
    }
  }
  return map;
}
