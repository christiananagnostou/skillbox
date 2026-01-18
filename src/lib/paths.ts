import os from "node:os";
import path from "node:path";

export const skillboxRoot = (): string => path.join(os.homedir(), ".skillbox");
export const skillboxSkillsDir = (): string => path.join(skillboxRoot(), "skills");
export const skillboxIndexPath = (): string => path.join(skillboxRoot(), "index.json");
export const skillboxProjectsPath = (): string => path.join(skillboxRoot(), "projects.json");
