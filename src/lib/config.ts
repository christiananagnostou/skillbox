import fs from "node:fs/promises";
import path from "node:path";
import { skillboxRoot, skillboxTmpDir } from "./paths.js";

export type SkillboxConfig = {
  version: 1;
  defaultAgents: string[];
  defaultScope: "project" | "user";
  installMode: "symlink" | "copy";
};

function defaultInstallMode(): "symlink" | "copy" {
  return process.platform === "win32" ? "copy" : "symlink";
}

function defaultConfig(): SkillboxConfig {
  return {
    version: 1,
    defaultAgents: [],
    defaultScope: "user",
    installMode: defaultInstallMode(),
  };
}

export function configPath(): string {
  return path.join(skillboxRoot(), "config.json");
}

export async function loadConfig(): Promise<SkillboxConfig> {
  try {
    const content = await fs.readFile(configPath(), "utf8");
    return JSON.parse(content) as SkillboxConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw error;
  }
}

export async function saveConfig(config: SkillboxConfig): Promise<void> {
  await fs.mkdir(skillboxRoot(), { recursive: true });
  await fs.mkdir(skillboxTmpDir(), { recursive: true });
  const json = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath(), `${json}\n`, "utf8");
}
