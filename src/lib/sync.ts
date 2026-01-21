import fs from "node:fs/promises";
import path from "node:path";
import type { AgentId, AgentPathMap } from "./agents.js";
import { getErrorMessage } from "./command.js";
import type { SkillboxConfig } from "./config.js";
import { skillDir } from "./skill-store.js";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFiles(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir);
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
      continue;
    }
    await fs.copyFile(sourcePath, destPath);
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

  for (const targetRoot of targets) {
    const targetDir = path.join(targetRoot, skillName);
    await ensureDir(targetRoot);

    if (config.installMode === "symlink") {
      try {
        const status = await createSymlink(sourceDir, targetDir);
        results.push({ path: targetDir, mode: status === "exists" ? "symlink" : "symlink" });
      } catch (error) {
        const message = getErrorMessage(error, "unknown error");
        results.push({ path: targetDir, mode: "skipped", error: message });
      }
      continue;
    }

    await ensureDir(targetDir);
    await copyFiles(sourceDir, targetDir);
    results.push({ path: targetDir, mode: "copy" });
  }

  return results;
}

export async function copySkillToInstallPaths(
  skillName: string,
  installPaths: string[]
): Promise<void> {
  const sourceDir = skillDir(skillName);
  for (const installPath of installPaths) {
    await ensureDir(installPath);
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
