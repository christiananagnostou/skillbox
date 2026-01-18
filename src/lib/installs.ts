import type { IndexedSkill, SkillInstall } from "./types.js";

const projectInstalls = (
  install: SkillInstall
): install is SkillInstall & { projectRoot: string } => {
  return install.scope === "project" && Boolean(install.projectRoot);
};

export const collectProjectSkills = (skills: IndexedSkill[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    for (const install of skill.installs ?? []) {
      if (!projectInstalls(install)) {
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
};

export const getProjectSkills = (skills: IndexedSkill[], projectRoot: string): string[] => {
  const map = collectProjectSkills(skills);
  return (map.get(projectRoot) ?? []).sort();
};

export const getProjectInstallPaths = (
  skills: IndexedSkill[],
  projectRoot: string
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const paths = (skill.installs ?? [])
      .filter(projectInstalls)
      .filter((install) => install.projectRoot === projectRoot)
      .map((install) => install.path);
    if (paths.length > 0) {
      map.set(skill.name, paths);
    }
  }
  return map;
};
