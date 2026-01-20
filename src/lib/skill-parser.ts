import { hashContent } from "./skill-store.js";
import type { SkillMetadata, SkillSource } from "./types.js";

export type ParsedSkill = {
  name?: string;
  description?: string;
  markdown: string;
  checksum: string;
};

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n/;

export function parseSkillMarkdown(markdown: string): ParsedSkill {
  const match = markdown.match(FRONTMATTER_REGEX);
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
      const trimmedKey = key.trim();
      if (trimmedKey === "name") {
        name = value;
      } else if (trimmedKey === "description") {
        description = value;
      }
    }
  }

  return {
    name,
    description,
    markdown,
    checksum: hashContent(markdown),
  };
}

export function inferNameFromUrl(url: string): string | null {
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
}

export function buildMetadata(
  parsed: ParsedSkill,
  source: SkillSource,
  nameOverride?: string
): SkillMetadata {
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
    updatedAt: new Date().toISOString(),
  };
}
