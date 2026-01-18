import fs from "node:fs/promises";
import { skillboxRoot } from "./paths.js";
import path from "node:path";

export type SkillboxConfig = {
  version: 1;
  defaultAgents: string[];
  defaultScope: "project" | "user";
  manageSystem: boolean;
};

const defaultConfig = (): SkillboxConfig => ({
  version: 1,
  defaultAgents: [],
  defaultScope: "project",
  manageSystem: false
});

export const configPath = (): string => path.join(skillboxRoot(), "config.json");

export const loadConfig = async (): Promise<SkillboxConfig> => {
  try {
    const content = await fs.readFile(configPath(), "utf8");
    return JSON.parse(content) as SkillboxConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw error;
  }
};

export const saveConfig = async (config: SkillboxConfig): Promise<void> => {
  await fs.mkdir(skillboxRoot(), { recursive: true });
  const json = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath(), `${json}\n`, "utf8");
};
