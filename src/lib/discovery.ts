import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "./fs-utils.js";

export type DiscoveredSkill = {
  name: string;
  skillDir: string;
  skillFile: string;
};

export async function discoverSkills(paths: string[]): Promise<DiscoveredSkill[]> {
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
}
