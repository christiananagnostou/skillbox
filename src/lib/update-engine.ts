import fs from "node:fs/promises";
import path from "node:path";
import { withMutationLock } from "./mutation-lock.js";
import { publishDirectory, recoverDirectory } from "./directory-publish.js";
import { hasManagedEdits, writeManagedManifest } from "./managed-manifest.js";
import { loadConfig } from "./config.js";
import { fetchText } from "./fetcher.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "./index.js";
import {
  fetchRepoFile,
  normalizeRepoRef,
  resolveRepoSnapshot,
  writeRepoSkillDirectory,
} from "./repo-skills.js";
import { buildMetadata, parseSkillMarkdown } from "./skill-parser.js";
import { ensureSkillsDir, skillDir, hashContent, readSkillMetadata } from "./skill-store.js";
import { installSkillToTargets } from "./sync.js";
import type { IndexedSkill, SkillIndex, SkillMetadata } from "./types.js";

export type UpdateResult = {
  name: string;
  source: string;
  status: "updated" | "failed" | "skipped";
  reason?: string;
  error?: string;
};

export type UpdateOptions = {
  name?: string;
  projectRoot?: string | null;
  dryRun?: boolean;
  exclude?: string[];
  pinned?: string[];
  onResult?: (result: UpdateResult) => void;
};

export type UpdateSummary = {
  results: UpdateResult[];
  total: number;
  updated: number;
  failed: number;
  skipped: number;
};

async function publishUrlSkill(skill: IndexedSkill): Promise<SkillMetadata> {
  if (!skill.source.url) {
    throw new Error(`Invalid source for skill ${skill.name}.`);
  }

  const markdown = await fetchText(skill.source.url);
  const parsed = parseSkillMarkdown(markdown);

  if (!parsed.description) {
    throw new Error(`Skill ${skill.name} is missing a description after update.`);
  }

  const metadata = buildMetadata(parsed, { type: "url", url: skill.source.url }, skill.name);
  const staging = await fs.mkdtemp(`${skillDir(skill.name)}.staging-`);
  try {
    await fs.writeFile(path.join(staging, "SKILL.md"), markdown, "utf8");
    await fs.writeFile(path.join(staging, "skill.json"), JSON.stringify(metadata) + "\n", "utf8");
    await writeManagedManifest(staging);
    await publishDirectory(staging, skillDir(skill.name));
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }

  return metadata;
}

async function publishGitSkill(skill: IndexedSkill): Promise<SkillMetadata> {
  if (!skill.source.repo) {
    throw new Error(`Invalid source for skill ${skill.name}.`);
  }

  const [owner, repo] = skill.source.repo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid source for skill ${skill.name}.`);
  }

  const skillPath = skill.source.path?.replace(/\/$/, "") ?? "";
  const ref = await normalizeRepoRef({
    owner,
    repo,
    ref: skill.source.ref ?? "main",
  });
  const skillFilePath = skillPath ? `${skillPath}/SKILL.md` : "SKILL.md";
  const snapshot = await resolveRepoSnapshot(ref);
  const markdown = await fetchRepoFile(snapshot, skillFilePath);
  const parsed = parseSkillMarkdown(markdown);

  if (!parsed.description) {
    throw new Error(`Skill ${skill.name} is missing a description after update.`);
  }

  const source = {
    type: "git" as const,
    repo: skill.source.repo,
    path: skillPath || undefined,
    ref: ref.ref,
  };
  const metadata = buildMetadata(parsed, source, skill.name);
  await writeRepoSkillDirectory(snapshot, skillPath, skill.name, metadata);

  return metadata;
}

async function updateSkill(
  skill: IndexedSkill,
  index: SkillIndex,
  installPaths: string[],
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  let metadata: SkillMetadata;
  if (skill.source.type === "url") metadata = await publishUrlSkill(skill);
  else if (skill.source.type === "git") metadata = await publishGitSkill(skill);
  else throw new Error("Unsupported source type.");

  // Persist canonical publication before synchronizing targets. A failed target
  // must retain its pending path while successful canonical content stays indexed.
  const nextIndex = upsertSkill(index, {
    name: skill.name,
    source: metadata.source,
    checksum: metadata.checksum,
    updatedAt: metadata.updatedAt,
    pendingSync: installPaths,
  });
  index.skills = nextIndex.skills;
  await saveIndex(sortIndex(index));
  if (installPaths.length > 0) {
    const results = await installSkillToTargets(skill.name, installPaths, config);
    const failed = results.filter((result) => result.error || result.mode === "skipped");
    index.skills.find((entry) => entry.name === skill.name)!.pendingSync = failed.map(
      (result) => result.path
    );
    await saveIndex(sortIndex(index));
    if (failed.length)
      throw new Error(
        `Canonical content updated, but target synchronization failed: ${failed.map((result) => `${result.path}: ${result.error ?? "skipped"}`).join("; ")}`
      );
  }

  index.skills.find((entry) => entry.name === skill.name)!.lastSync = new Date().toISOString();
  await saveIndex(sortIndex(index));
}

async function hasLocalEdits(
  skill: IndexedSkill,
  installPaths: string[],
  dryRun = false
): Promise<string | null> {
  const locations = [skillDir(skill.name), ...installPaths];
  for (const location of locations) {
    if (!dryRun) await recoverDirectory(location);
    else {
      try {
        await fs.access(
          path.join(path.dirname(location), `.${path.basename(location)}.publish.json`)
        );
        return "pending interrupted-update recovery";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const edits = await hasManagedEdits(location);
    if (edits === true) return "locally modified";
    if (edits === false) continue;
    if (skill.source.type === "git")
      return "missing managed-file baseline; run skillbox migrate-baseline";
    const entries = await fs.readdir(location).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (entries.some((entry) => !["SKILL.md", "skill.json"].includes(entry))) {
      return "missing managed-file baseline for auxiliary files; run skillbox migrate-baseline";
    }
    let content: string;
    try {
      content = await fs.readFile(path.join(location, "SKILL.md"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    // Older installations append one newline after computing the stored checksum.
    if (
      hashContent(content) !== skill.checksum &&
      !(content.endsWith("\n") && hashContent(content.slice(0, -1)) === skill.checksum)
    )
      return "locally modified";
    // Capture the validated legacy baseline before publication, so failed target
    // synchronization can be retried against its own old content.
    if (!dryRun) await writeManagedManifest(location);
  }
  return null;
}

async function resolveProjectIdentity(root: string): Promise<string> {
  const resolved = path.resolve(root);
  try {
    return await fs.realpath(resolved);
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    // Missing roots remain distinct by their recorded absolute paths.
    return resolved;
  }
}

async function selectInstallPaths(
  skill: IndexedSkill,
  projectRoot: string | null
): Promise<{
  installPaths: string[];
  sharedWithOtherScopes: boolean;
}> {
  const installs = skill.installs ?? [];
  if (!projectRoot)
    return { installPaths: installs.map((install) => install.path), sharedWithOtherScopes: false };
  const matches = await Promise.all(
    installs.map(
      async (install) =>
        install.scope === "project" &&
        Boolean(install.projectRoot) &&
        (await resolveProjectIdentity(install.projectRoot!)) === projectRoot
    )
  );
  return {
    installPaths: installs
      .filter((_install, index) => matches[index])
      .map((install) => install.path),
    sharedWithOtherScopes: matches.some((matchesProject) => !matchesProject),
  };
}

export async function runUpdates(options: UpdateOptions = {}): Promise<UpdateSummary> {
  return withMutationLock(() => runUpdatesLocked(options));
}

async function runUpdatesLocked(options: UpdateOptions): Promise<UpdateSummary> {
  const index = await loadIndex();
  const targets = options.name
    ? index.skills.filter((skill) => skill.name === options.name)
    : index.skills;
  if (options.name && targets.length === 0) throw new Error(`Skill not found: ${options.name}`);
  const config = await loadConfig();
  const projectRoot = options.projectRoot
    ? await resolveProjectIdentity(options.projectRoot)
    : null;
  const results: UpdateResult[] = [];
  if (!options.dryRun) await ensureSkillsDir();
  for (const skill of targets) {
    let result: UpdateResult = { name: skill.name, source: skill.source.type, status: "skipped" };
    try {
      if (!skill.name || skill.name === "." || skill.name === ".." || /[\\/]/.test(skill.name)) {
        throw new Error("Invalid indexed skill name.");
      }
      const { installPaths, sharedWithOtherScopes } = await selectInstallPaths(skill, projectRoot);
      if (skill.disabled) result.reason = "disabled";
      else if (skill.source.type === "local") result.reason = "local source";
      else if (options.exclude?.includes(skill.name)) result.reason = "excluded";
      else if (
        options.pinned?.includes(skill.name) ||
        /^[a-f0-9]{40}$/i.test(skill.source.ref ?? "")
      )
        result.reason = "pinned";
      else if (projectRoot && !installPaths.length) result.reason = "outside selected project";
      else if (sharedWithOtherScopes) result.reason = "canonical content shared with other scopes";
      else {
        if (skill.source.type === "url" && !skill.source.url)
          throw new Error(`Invalid source for skill ${skill.name}.`);
        if (skill.source.type === "git" && !/^[^/]+\/[^/]+$/.test(skill.source.repo ?? ""))
          throw new Error(`Invalid source for skill ${skill.name}.`);
        const editReason = await hasLocalEdits(skill, installPaths, options.dryRun);
        if (editReason) result.reason = editReason;
        else if (options.dryRun) result.reason = "eligible (dry run)";
        else {
          const metadata = await readSkillMetadata(skill.name).catch(
            (error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") return null;
              throw error;
            }
          );
          // Recover the index half of an interrupted canonical publication.
          if (
            metadata &&
            metadata.name === skill.name &&
            metadata.checksum !== skill.checksum &&
            (await hasManagedEdits(skillDir(skill.name))) === false &&
            hashContent(await fs.readFile(path.join(skillDir(skill.name), "SKILL.md"), "utf8")) ===
              metadata.checksum
          ) {
            Object.assign(skill, {
              checksum: metadata.checksum,
              updatedAt: metadata.updatedAt,
              pendingSync: installPaths,
            });
            index.skills = upsertSkill(index, skill).skills;
            await saveIndex(sortIndex(index));
          }
          await updateSkill(skill, index, installPaths, config);
          result.status = "updated";
        }
      }
    } catch (error) {
      result = {
        ...result,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown update error",
      };
    }
    results.push(result);
    options.onResult?.(result);
  }
  if (!options.dryRun) await saveIndex(sortIndex(index));
  return {
    results,
    total: results.length,
    updated: results.filter((result) => result.status === "updated").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
}
