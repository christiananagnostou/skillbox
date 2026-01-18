import path from "node:path";
import { hashContent } from "./skill-store.js";
import type { SkillMetadata, SkillSource } from "./types.js";

export type ParsedSkill = {
  name?: string;
  description?: string;
  markdown: string;
  checksum: string;
};

const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;

export const parseSkillMarkdown = (markdown: string): ParsedSkill => {
  const match = markdown.match(frontmatterRegex);
  let name: string | undefined;
  let description: string | undefined;

  if (match) {
    const frontmatter = match[1];
    for (const line of frontmatter.split("\n")) {
      const [key, ...rest] = line.split(":");
      if (!key || rest.length === 0) {
        continue;
      }
      const value = rest.join(":").trim();
      if (key.trim() === "name") {
        name = value;
      }
      if (key.trim() === "description") {
        description = value;
      }
    }
  }

  const checksum = hashContent(markdown);

  return {
    name,
    description,
    markdown,
    checksum
  };
};

export const inferNameFromUrl = (url: string): string | null => {
  const cleaned = url.split("?")[0].split("#")[0];
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const last = parts[parts.length - 1];
  const base = last.toLowerCase();
  if (base === "skill.md" || base === "skill" || base === "skill.json") {
    if (parts.length < 2) {
      return null;
    }
    return parts[parts.length - 2];
  }
  return last.replace(/\.md$/, "");
};

export const buildMetadata = (
  parsed: ParsedSkill,
  source: SkillSource,
  nameOverride?: string
): SkillMetadata => {
  const name = nameOverride ?? parsed.name;
  if (!name) {
    throw new Error("Skill metadata requires a name.");
  }

  return {
    name,
    version: "0.1.0",
    description: parsed.description,
    entry: "SKILL.md",
    source,
    checksum: parsed.checksum,
    updatedAt: new Date().toISOString()
  };
};
