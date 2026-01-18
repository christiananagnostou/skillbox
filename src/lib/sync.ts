import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "./skill-store.js";
import type { AgentId, AgentPathMap } from "./agents.js";

export const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

export const copySkillToTargets = async (
  skillName: string,
  targets: string[]
): Promise<string[]> => {
  const sourceDir = skillDir(skillName);
  const entries = await fs.readdir(sourceDir);

  const writtenPaths: string[] = [];

  for (const targetRoot of targets) {
    const targetDir = path.join(targetRoot, skillName);
    await ensureDir(targetDir);

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry);
      const destPath = path.join(targetDir, entry);
      const stat = await fs.stat(sourcePath);
      if (stat.isDirectory()) {
        continue;
      }
      await fs.copyFile(sourcePath, destPath);
    }
    writtenPaths.push(targetDir);
  }

  return writtenPaths;
};

export type SyncTarget = {
  agent: AgentId;
  scope: "user" | "project" | "system";
  path: string;
};

export const buildTargets = (
  agent: AgentId,
  paths: AgentPathMap,
  scope: "user" | "project" | "system"
): SyncTarget[] => {
  if (scope === "system") {
    return (paths.system ?? []).map((pathValue) => ({ agent, scope, path: pathValue }));
  }
  const list = scope === "user" ? paths.user : paths.project;
  return list.map((pathValue) => ({ agent, scope, path: pathValue }));
};
