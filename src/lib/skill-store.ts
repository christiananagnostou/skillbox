import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { skillboxSkillsDir } from "./paths.js";
import type { SkillMetadata } from "./types.js";

export const ensureSkillsDir = async (): Promise<void> => {
  await fs.mkdir(skillboxSkillsDir(), { recursive: true });
};

export const skillDir = (name: string): string => {
  return path.join(skillboxSkillsDir(), name);
};

export const writeSkillFiles = async (
  name: string,
  skillMarkdown: string,
  metadata: SkillMetadata
): Promise<void> => {
  const targetDir = skillDir(name);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "SKILL.md"), `${skillMarkdown}\n`, "utf8");
  await fs.writeFile(
    path.join(targetDir, "skill.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
};

export const readSkillMetadata = async (name: string): Promise<SkillMetadata> => {
  const targetDir = skillDir(name);
  const content = await fs.readFile(path.join(targetDir, "skill.json"), "utf8");
  return JSON.parse(content) as SkillMetadata;
};

export const writeSkillMetadata = async (name: string, metadata: SkillMetadata): Promise<void> => {
  const targetDir = skillDir(name);
  await fs.writeFile(
    path.join(targetDir, "skill.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
};

export const hashContent = (content: string): string => {
  return crypto.createHash("sha256").update(content).digest("hex");
};
