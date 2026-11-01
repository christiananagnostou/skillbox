import fs from "node:fs/promises";
import path from "node:path";
import { loadIndex } from "./index.js";
import { withMutationLock } from "./mutation-lock.js";
import {
  compareManagedManifest,
  readManagedManifest,
  setManagedManifest,
} from "./managed-manifest.js";
import { fetchText } from "./fetcher.js";
import { fetchRepoManifest, normalizeRepoRef, resolveRepoSnapshot } from "./repo-skills.js";
import { hashContent, skillDir } from "./skill-store.js";
import { parseSkillMarkdown } from "./skill-parser.js";
import { recoverDirectory } from "./directory-publish.js";

export type MigrationResult = {
  name: string;
  status: "migrated" | "skipped" | "failed";
  reason?: string;
  snapshot?: string;
  locations?: Array<{
    path: string;
    status: "matched" | "modified" | "existing" | "missing";
    differences?: string[];
  }>;
  error?: string;
};

export async function migrateBaselines(
  options: { name?: string; dryRun?: boolean } = {}
): Promise<MigrationResult[]> {
  return withMutationLock(async () => {
    const index = await loadIndex();
    const skills = options.name
      ? index.skills.filter((skill) => skill.name === options.name)
      : index.skills;
    if (options.name && !skills.length) throw new Error(`Skill not found: ${options.name}`);
    const results: MigrationResult[] = [];
    for (const skill of skills) {
      const result: MigrationResult = { name: skill.name, status: "skipped" };
      try {
        if (!skill.name || skill.name === "." || skill.name === ".." || /[\\/]/.test(skill.name))
          throw new Error("Invalid indexed skill name.");
        if (skill.source.type === "local") {
          result.reason = "local source";
          results.push(result);
          continue;
        }
        const locations: NonNullable<MigrationResult["locations"]> = [];
        const pending: string[] = [];
        const seen = new Set<string>();
        for (const location of [
          skillDir(skill.name),
          ...(skill.installs ?? []).map((install) => install.path),
        ]) {
          if (!options.dryRun) await recoverDirectory(location);
          else {
            try {
              await fs.access(
                path.join(path.dirname(location), `.${path.basename(location)}.publish.json`)
              );
              throw new Error("Pending interrupted-update recovery; run a normal update first.");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
          }
          let real: string;
          try {
            real = await fs.realpath(location);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            locations.push({ path: location, status: "missing" });
            continue;
          }
          if (seen.has(real)) continue;
          seen.add(real);
          if (await readManagedManifest(real))
            locations.push({ path: location, status: "existing" });
          else pending.push(real);
        }
        result.locations = locations;
        if (!pending.length) {
          result.reason = "no existing locations need migration";
          results.push(result);
          continue;
        }
        let baseline: Record<string, string>;
        let markdown: string | undefined;
        if (skill.source.type === "git") {
          if (!/^[^/]+\/[^/]+$/.test(skill.source.repo ?? ""))
            throw new Error("Invalid repository source.");
          const [owner, repo] = skill.source.repo!.split("/");
          const snapshot = await resolveRepoSnapshot(
            await normalizeRepoRef({ owner, repo, ref: skill.source.ref ?? "main" })
          );
          baseline = await fetchRepoManifest(snapshot, skill.source.path ?? "");
          result.snapshot = snapshot.ref;
        } else if (skill.source.type === "url" && skill.source.url) {
          markdown = await fetchText(skill.source.url);
          if (!parseSkillMarkdown(markdown).description)
            throw new Error("Upstream skill is missing a description.");
          baseline = { "SKILL.md": hashContent(markdown) };
        } else throw new Error("Invalid remote source.");
        // Validate every location before writing any baseline. Assets are never changed.
        const plans = [];
        for (const directory of pending) {
          const manifest = { ...baseline };
          if (markdown !== undefined) {
            const local = await fs
              .readFile(path.join(directory, "SKILL.md"), "utf8")
              .catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null;
                throw error;
              });
            if (local === markdown + "\n") manifest["SKILL.md"] = hashContent(local);
          }
          const differences = await compareManagedManifest(directory, manifest);
          plans.push({ directory, manifest });
          locations.push({
            path: directory,
            status: differences.length ? "modified" : "matched",
            differences,
          });
        }
        if (!options.dryRun)
          for (const plan of plans) await setManagedManifest(plan.directory, plan.manifest);
        result.status = "migrated";
        result.reason = locations.some((location) => location.status === "modified")
          ? "Differences preserved; updates remain blocked for modified locations."
          : "Matched upstream baseline; eligible for normal update checks.";
      } catch (error) {
        result.status = "failed";
        result.error = error instanceof Error ? error.message : "Baseline migration failed";
      }
      results.push(result);
    }
    return results;
  });
}
