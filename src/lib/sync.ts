import fs from "node:fs/promises";
import path from "node:path";
import type { AgentId, AgentPathMap } from "./agents.js";
import { getErrorMessage } from "./command.js";
import type { SkillboxConfig } from "./config.js";
import { loadIndex } from "./index.js";
import {
  hasManagedEdits,
  readManagedManifest,
  compareManagedManifest,
} from "./managed-manifest.js";
import { publishDirectory, recoverDirectory } from "./directory-publish.js";
import { hashContent, skillDir } from "./skill-store.js";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function legacyTreeMatches(
  sourceDir: string,
  targetDir: string,
  checksum: string
): Promise<boolean> {
  async function compare(relative = ""): Promise<boolean> {
    const readEntries = async (root: string) =>
      (await fs.readdir(path.join(root, relative), { withFileTypes: true }))
        .filter(
          (entry) => relative || !["skill.json", ".skillbox-manifest.json"].includes(entry.name)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    const sourceEntries = await readEntries(sourceDir);
    const targetEntries = await readEntries(targetDir);
    if (sourceEntries.length !== targetEntries.length) return false;
    for (let i = 0; i < sourceEntries.length; i++) {
      const sourceEntry = sourceEntries[i];
      const targetEntry = targetEntries[i];
      if (sourceEntry.name !== targetEntry.name) return false;
      const name = relative ? `${relative}/${sourceEntry.name}` : sourceEntry.name;
      if (sourceEntry.isDirectory() && targetEntry.isDirectory()) {
        if (!(await compare(name))) return false;
      } else if (sourceEntry.isFile() && targetEntry.isFile()) {
        const source = await fs.readFile(path.join(sourceDir, name));
        const target = await fs.readFile(path.join(targetDir, name));
        if (source.equals(target)) continue;
        // Historical imports appended exactly one newline to canonical SKILL.md.
        // Accept only that precise difference, with both forms tied to the index checksum.
        if (
          name !== "SKILL.md" ||
          !source.equals(Buffer.concat([target, Buffer.from("\n")])) ||
          hashContent(target.toString("utf8")) !== checksum ||
          hashContent(source.subarray(0, -1).toString("utf8")) !== checksum
        )
          return false;
      } else return false;
    }
    return true;
  }
  return compare();
}

async function copyFiles(sourceDir: string, targetDir: string): Promise<void> {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) return;
  // Preserve an existing canonical symlink when switching configured install modes.
  if (await isSymlinkTo(targetDir, sourceDir)) return;
  await recoverDirectory(targetDir);
  let exists = false;
  try {
    await fs.lstat(targetDir);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (exists) {
    const indexed = (await loadIndex()).skills.find(
      (entry) => entry.name === path.basename(sourceDir)
    );
    if (
      !indexed?.installs?.some((install) => path.resolve(install.path) === path.resolve(targetDir))
    ) {
      throw new Error(`Refusing to overwrite untracked install directory: ${targetDir}`);
    }
    const edited = await hasManagedEdits(targetDir);
    if (edited === true)
      throw new Error(`Refusing to overwrite locally modified install: ${targetDir}`);
    if (edited === null) {
      const sourceBaseline = await readManagedManifest(sourceDir);
      const verified = sourceBaseline
        ? (await compareManagedManifest(targetDir, sourceBaseline)).length === 0
        : await legacyTreeMatches(sourceDir, targetDir, indexed.checksum);
      if (!verified) {
        throw new Error(`Refusing to overwrite install without a verified baseline: ${targetDir}`);
      }
    }
  }
  const staging = await fs.mkdtemp(path.join(path.dirname(targetDir), ".skillbox-copy-"));
  try {
    await fs.cp(sourceDir, staging, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
    await publishDirectory(staging, targetDir);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function isSymlinkTo(targetDir: string, expectedSource: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(targetDir);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const linkTarget = await fs.readlink(targetDir);
    return linkTarget === expectedSource;
  } catch {
    return false;
  }
}

async function createSymlink(sourceDir: string, targetDir: string): Promise<"created" | "exists"> {
  if (await isSymlinkTo(targetDir, sourceDir)) {
    return "exists";
  }
  await fs.symlink(sourceDir, targetDir, "dir");
  return "created";
}

export type InstallResult = {
  path: string;
  mode: "symlink" | "copy" | "skipped";
  error?: string;
};

export function buildSymlinkWarning(agent: string, results: InstallResult[]): string[] {
  const skipped = results.filter((result) => result.mode === "skipped");
  if (skipped.length === 0) {
    return [];
  }

  const warnings: string[] = [];
  for (const result of skipped) {
    const skillName = path.basename(result.path);
    const isExists = result.error?.includes("EEXIST");
    if (isExists) {
      warnings.push(
        `  ⚠ ${skillName} (${agent}): already exists at target, remove manually or use --install-mode copy`
      );
    } else {
      warnings.push(`  ⚠ ${skillName} (${agent}): ${result.error ?? "unknown error"}`);
    }
  }
  return warnings;
}

export async function installSkillToTargets(
  skillName: string,
  targets: string[],
  config: SkillboxConfig
): Promise<InstallResult[]> {
  const sourceDir = skillDir(skillName);
  const results: InstallResult[] = [];

  for (const targetDir of targets) {
    if (config.installMode === "symlink") {
      try {
        await ensureDir(path.dirname(targetDir));
        const status = await createSymlink(sourceDir, targetDir);
        results.push({ path: targetDir, mode: status === "exists" ? "symlink" : "symlink" });
      } catch (error) {
        const message = getErrorMessage(error, "unknown error");
        results.push({ path: targetDir, mode: "skipped", error: message });
      }
      continue;
    }

    try {
      await ensureDir(path.dirname(targetDir));
      await copyFiles(sourceDir, targetDir);
      results.push({ path: targetDir, mode: "copy" });
    } catch (error) {
      results.push({
        path: targetDir,
        mode: "skipped",
        error: getErrorMessage(error, "unknown error"),
      });
    }
  }

  return results;
}

export async function copySkillToInstallPaths(
  skillName: string,
  installPaths: string[]
): Promise<void> {
  const sourceDir = skillDir(skillName);
  for (const installPath of installPaths) {
    await ensureDir(path.dirname(installPath));
    await copyFiles(sourceDir, installPath);
  }
}

export type SyncTarget = {
  agent: AgentId;
  scope: "user" | "project";
  path: string;
};

export function buildTargets(
  agent: AgentId,
  paths: AgentPathMap,
  scope: "user" | "project"
): SyncTarget[] {
  const list = scope === "user" ? paths.user : paths.project;
  return list.map((pathValue) => ({ agent, scope, path: pathValue }));
}
