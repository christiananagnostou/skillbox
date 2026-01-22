import fs from "node:fs/promises";
import { skillboxIndexPath, skillboxRoot } from "./paths.js";
import type { SkillIndex } from "./types.js";

function emptyIndex(): SkillIndex {
  return { version: 1, skills: [] };
}

export async function loadIndex(): Promise<SkillIndex> {
  const filePath = skillboxIndexPath();
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as SkillIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyIndex();
    }
    throw error;
  }
}

export async function saveIndex(index: SkillIndex): Promise<void> {
  await fs.mkdir(skillboxRoot(), { recursive: true });
  const filePath = skillboxIndexPath();
  const json = JSON.stringify(index, null, 2);
  await fs.writeFile(filePath, `${json}\n`, "utf8");
}

export function upsertSkill(index: SkillIndex, skill: SkillIndex["skills"][number]): SkillIndex {
  const next = { ...index, skills: [...index.skills] };
  const existingIndex = next.skills.findIndex((item) => item.name === skill.name);
  if (existingIndex === -1) {
    next.skills.push(skill);
    return next;
  }

  const existing = next.skills[existingIndex];
  const mergedInstalls = mergeInstalls(existing.installs, skill.installs);

  next.skills[existingIndex] = { ...existing, ...skill, installs: mergedInstalls };
  return next;
}

function mergeInstalls(
  existing: SkillIndex["skills"][number]["installs"],
  incoming: SkillIndex["skills"][number]["installs"]
): SkillIndex["skills"][number]["installs"] {
  if (!existing && !incoming) return undefined;
  if (!existing) return incoming;
  if (!incoming) return existing;

  // Dedupe by scope + agent + projectRoot combination
  const seen = new Set<string>();
  const merged: NonNullable<SkillIndex["skills"][number]["installs"]> = [];

  for (const install of [...existing, ...incoming]) {
    const key = `${install.scope}:${install.agent}:${install.projectRoot ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(install);
  }

  return merged;
}

export function sortIndex(index: SkillIndex): SkillIndex {
  const skills = [...index.skills].sort((a, b) => a.name.localeCompare(b.name));
  return { ...index, skills };
}

export function ensureIndexSchema(index: SkillIndex): SkillIndex {
  if (!index.version) {
    return { version: 1, skills: index.skills ?? [] };
  }
  return index;
}
