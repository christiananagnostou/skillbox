import fs from "node:fs/promises";
import path from "node:path";

export type DiscoveredSkill = {
  name: string;
  skillDir: string;
  skillFile: string;
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const discoverSkills = async (paths: string[]): Promise<DiscoveredSkill[]> => {
  const results: DiscoveredSkill[] = [];

  for (const root of paths) {
    if (!(await exists(root))) {
      continue;
    }
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillDir = path.join(root, entry.name);
      const skillFile = path.join(skillDir, "SKILL.md");
      if (!(await exists(skillFile))) {
        continue;
      }
      results.push({ name: entry.name, skillDir, skillFile });
    }
  }

  return results;
};
