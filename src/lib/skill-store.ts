import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { skillboxSkillsDir } from "./paths.js";
import { buildMetadata, parseSkillMarkdown } from "./skill-parser.js";
import type { SkillMetadata } from "./types.js";

export type ImportedSkillData = {
  name: string;
  checksum: string;
  updatedAt: string;
};

export async function ensureSkillsDir(): Promise<void> {
  await fs.mkdir(skillboxSkillsDir(), { recursive: true });
}

export function skillDir(name: string): string {
  return path.join(skillboxSkillsDir(), name);
}

export async function writeSkillFiles(
  name: string,
  skillMarkdown: string,
  metadata: SkillMetadata
): Promise<void> {
  const targetDir = skillDir(name);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "SKILL.md"), `${skillMarkdown}\n`, "utf8");
  await fs.writeFile(
    path.join(targetDir, "skill.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

export async function readSkillMetadata(name: string): Promise<SkillMetadata> {
  const targetDir = skillDir(name);
  const content = await fs.readFile(path.join(targetDir, "skill.json"), "utf8");
  return JSON.parse(content) as SkillMetadata;
}

export async function writeSkillMetadata(name: string, metadata: SkillMetadata): Promise<void> {
  const targetDir = skillDir(name);
  await fs.writeFile(
    path.join(targetDir, "skill.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Import a skill from a local directory. Reads the markdown, parses it,
 * and writes to the skill store. Returns the data needed for index updates,
 * or null if the skill is invalid (missing description).
 */
export async function importSkillFromDir(skillFile: string): Promise<ImportedSkillData | null> {
  const markdown = await fs.readFile(skillFile, "utf8");
  const parsed = parseSkillMarkdown(markdown);

  if (!parsed.description) {
    return null;
  }

  const metadata = buildMetadata(parsed, { type: "local" });
  await ensureSkillsDir();
  await writeSkillFiles(metadata.name, markdown, metadata);

  return {
    name: metadata.name,
    checksum: parsed.checksum,
    updatedAt: metadata.updatedAt,
  };
}
