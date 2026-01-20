import os from "node:os";
import path from "node:path";

export function skillboxRoot(): string {
  return path.join(os.homedir(), ".config", "skillbox");
}

export function skillboxSkillsDir(): string {
  return path.join(skillboxRoot(), "skills");
}

export function skillboxIndexPath(): string {
  return path.join(skillboxRoot(), "index.json");
}

export function skillboxProjectsPath(): string {
  return path.join(skillboxRoot(), "projects.json");
}
