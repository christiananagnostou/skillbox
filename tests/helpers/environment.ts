import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Manages isolated test environment with temporary directories
 * that mirror the real skillbox directory structure.
 */
export class TestEnvironment {
  public testRoot: string = "";
  public configDir: string = "";
  public skillsDir: string = "";
  public agentSkillsDir: string = "";
  public projectDir: string = "";

  private originalEnv: Record<string, string | undefined> = {};

  async setup(): Promise<void> {
    // Create isolated test root
    this.testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-test-"));
    this.configDir = path.join(this.testRoot, ".config", "skillbox");
    this.skillsDir = path.join(this.configDir, "skills");
    this.agentSkillsDir = path.join(this.testRoot, ".claude", "skills");
    this.projectDir = path.join(this.testRoot, "test-project");

    // Create directory structure
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.agentSkillsDir, { recursive: true });
    await fs.mkdir(this.projectDir, { recursive: true });

    // Initialize empty index
    await fs.writeFile(
      path.join(this.configDir, "index.json"),
      JSON.stringify({ version: 1, skills: [] }, null, 2)
    );

    // Initialize config
    await fs.writeFile(
      path.join(this.configDir, "config.json"),
      JSON.stringify(
        {
          version: 1,
          defaultAgents: ["claude"],
          defaultScope: "user",
          installMode: "symlink",
        },
        null,
        2
      )
    );

    // Initialize empty projects
    await fs.writeFile(
      path.join(this.configDir, "projects.json"),
      JSON.stringify({ version: 1, projects: [] }, null, 2)
    );

    // Save and override environment variables
    this.originalEnv = {
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    };

    process.env.HOME = this.testRoot;
    process.env.XDG_CONFIG_HOME = path.join(this.testRoot, ".config");
  }

  async cleanup(): Promise<void> {
    // Restore environment
    Object.entries(this.originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    // Remove test directory
    if (this.testRoot) {
      await fs.rm(this.testRoot, { recursive: true, force: true });
    }
  }

  async reset(): Promise<void> {
    // Clear skills directory
    const skillEntries = await fs.readdir(this.skillsDir).catch(() => []);
    for (const entry of skillEntries) {
      await fs.rm(path.join(this.skillsDir, entry), { recursive: true, force: true });
    }

    // Clear agent skills directory
    const agentEntries = await fs.readdir(this.agentSkillsDir).catch(() => []);
    for (const entry of agentEntries) {
      await fs.rm(path.join(this.agentSkillsDir, entry), { recursive: true, force: true });
    }

    // Reset index
    await fs.writeFile(
      path.join(this.configDir, "index.json"),
      JSON.stringify({ version: 1, skills: [] }, null, 2)
    );

    // Reset projects
    await fs.writeFile(
      path.join(this.configDir, "projects.json"),
      JSON.stringify({ version: 1, projects: [] }, null, 2)
    );
  }

  async createSkillDir(name: string, content: string): Promise<string> {
    const skillDir = path.join(this.skillsDir, name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }

  async createProjectSkill(name: string, content: string): Promise<string> {
    const skillDir = path.join(this.projectDir, "skills", name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isSymlink(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.lstat(filePath);
      return stat.isSymbolicLink();
    } catch {
      return false;
    }
  }

  async readJson<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  }
}
