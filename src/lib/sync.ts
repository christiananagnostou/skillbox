import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "./skill-store.js";
import type { AgentId, AgentPathMap } from "./agents.js";
import type { SkillboxConfig } from "./config.js";
import { getErrorMessage } from "./command.js";

export const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

const copyFiles = async (sourceDir: string, targetDir: string): Promise<void> => {
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
};

const createSymlink = async (sourceDir: string, targetDir: string): Promise<void> => {
  await fs.symlink(sourceDir, targetDir, "dir");
};

export type InstallResult = {
  path: string;
  mode: "symlink" | "copy" | "skipped";
  error?: string;
};

export const buildSymlinkWarning = (agent: string, results: InstallResult[]): string | null => {
  const skipped = results.filter((result) => result.mode === "skipped");
  if (skipped.length === 0) {
    return null;
  }
  const details = skipped
    .map((result) => `${result.path}: ${result.error ?? "unknown error"}`)
    .join("; ");
  return `Warning: symlink failed for ${agent}. ${details}. Remove the existing target or run "skillbox config set --install-mode copy" to use file copies.`;
};

export const installSkillToTargets = async (
  skillName: string,
  targets: string[],
  config: SkillboxConfig
): Promise<InstallResult[]> => {
  const sourceDir = skillDir(skillName);
  const results: InstallResult[] = [];

  for (const targetRoot of targets) {
    const targetDir = path.join(targetRoot, skillName);
    await ensureDir(targetRoot);

    if (config.installMode === "symlink") {
      try {
        await createSymlink(sourceDir, targetDir);
        results.push({ path: targetDir, mode: "symlink" });
        continue;
      } catch (error) {
        const message = getErrorMessage(error, "unknown error");
        results.push({ path: targetDir, mode: "skipped", error: message });
        continue;
      }
    }

    await ensureDir(targetDir);
    await copyFiles(sourceDir, targetDir);
    results.push({ path: targetDir, mode: "copy" });
  }

  return results;
};

export const copySkillToInstallPaths = async (
  skillName: string,
  installPaths: string[]
): Promise<void> => {
  const sourceDir = skillDir(skillName);
  for (const installPath of installPaths) {
    await ensureDir(installPath);
    await copyFiles(sourceDir, installPath);
  }
};

export type SyncTarget = {
  agent: AgentId;
  scope: "user" | "project";
  path: string;
};

export const buildTargets = (
  agent: AgentId,
  paths: AgentPathMap,
  scope: "user" | "project"
): SyncTarget[] => {
  const list = scope === "user" ? paths.user : paths.project;
  return list.map((pathValue) => ({ agent, scope, path: pathValue }));
};
