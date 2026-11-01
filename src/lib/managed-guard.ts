import fs from "node:fs/promises";
import { loadIndex } from "./index.js";
import { hasManagedEdits } from "./managed-manifest.js";
import { recoverDirectory } from "./directory-publish.js";
import { skillDir } from "./skill-store.js";
import type { SkillSource } from "./types.js";

/** Re-add may replace only a proven, unchanged canonical skill from the same source. */
export async function assertCanonicalReplaceable(name: string, source: SkillSource): Promise<void> {
  if (!name || name === "." || name === ".." || /[\\/]/.test(name) || name.includes("\0")) {
    throw new Error("Invalid skill name.");
  }
  const indexed = (await loadIndex()).skills.find((entry) => entry.name === name);
  if (indexed?.disabled) throw new Error(`Skill ${name} is disabled; use enable instead of add.`);
  const directory = skillDir(name);
  await recoverDirectory(directory);
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`Refusing to replace unmanaged skill directory: ${name}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const sourceMatches =
    indexed &&
    ["type", "repo", "path", "ref", "url"].every(
      (key) => indexed.source[key as keyof SkillSource] === source[key as keyof SkillSource]
    );
  if (!sourceMatches)
    throw new Error(
      `Refusing to replace skill ${name}: existing directory is not indexed to this source.`
    );
  const edited = await hasManagedEdits(directory);
  if (edited === null)
    throw new Error(
      `Refusing to replace skill ${name}: no managed baseline. Run migrate-baseline first.`
    );
  if (edited) throw new Error(`Refusing to replace skill ${name}: local files have changed.`);
}
