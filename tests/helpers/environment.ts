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

  private async writeDefaultConfig(): Promise<void> {
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
  }

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
    await this.writeDefaultConfig();

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
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Remove test directory
    if (this.testRoot) {
      await fs.rm(this.testRoot, { recursive: true, force: true });
    }
  }

  async reset(): Promise<void> {
    // Clear skills directory
    const skillEntries = await fs.readdir(this.skillsDir).catch(() => []);
    for (const entry of skillEntries) {
      await fs.rm(path.join(this.skillsDir, entry), {
        recursive: true,
        force: true,
      });
    }

    // Clear agent skills directory
    const agentEntries = await fs.readdir(this.agentSkillsDir).catch(() => []);
    for (const entry of agentEntries) {
      await fs.rm(path.join(this.agentSkillsDir, entry), {
        recursive: true,
        force: true,
      });
    }

    // Reset index
    await fs.writeFile(
      path.join(this.configDir, "index.json"),
      JSON.stringify({ version: 1, skills: [] }, null, 2)
    );

    // Reset config
    await this.writeDefaultConfig();

    // Reset projects
    await fs.writeFile(
      path.join(this.configDir, "projects.json"),
      JSON.stringify({ version: 1, projects: [] }, null, 2)
    );

    // Reset project directory contents
    await fs.rm(this.projectDir, { recursive: true, force: true });
    await fs.mkdir(this.projectDir, { recursive: true });
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

  async installLocalSkill(
    name: string,
    skillContent: string,
    options: {
      description?: string;
      subcommands?: Record<string, string>;
    } = {}
  ): Promise<string> {
    const { description = `A test skill: ${name}`, subcommands } = options;
    const skillDir = path.join(this.skillsDir, name);
    const checksum = `test-checksum-${name}`;
    const updatedAt = new Date().toISOString();

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillContent);

    if (subcommands) {
      for (const [subName, content] of Object.entries(subcommands)) {
        await fs.writeFile(path.join(skillDir, `${subName}.md`), content);
      }
    }

    await fs.writeFile(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        description,
        entry: "SKILL.md",
        source: { type: "local" },
        checksum,
        updatedAt,
      })
    );

    const indexPath = path.join(this.configDir, "index.json");
    const index = await this.readJson<{ version: number; skills: unknown[] }>(indexPath);
    index.skills.push({
      name,
      source: { type: "local" },
      checksum,
      updatedAt,
      installs: [
        {
          scope: "user",
          agent: "claude",
          path: path.join(this.agentSkillsDir, name),
        },
      ],
    });
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    await fs.symlink(skillDir, path.join(this.agentSkillsDir, name));

    return skillDir;
  }

  async installProjectSkill(
    name: string,
    skillContent: string,
    options: {
      description?: string;
      subcommands?: Record<string, string>;
    } = {}
  ): Promise<string> {
    const { description = `A test skill: ${name}`, subcommands } = options;
    const skillDir = path.join(this.skillsDir, name);
    const checksum = `test-checksum-${name}`;
    const updatedAt = new Date().toISOString();
    const projectAgentDir = path.join(this.projectDir, ".claude", "skills");

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillContent);

    if (subcommands) {
      for (const [subName, content] of Object.entries(subcommands)) {
        await fs.writeFile(path.join(skillDir, `${subName}.md`), content);
      }
    }

    await fs.writeFile(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        description,
        entry: "SKILL.md",
        source: { type: "local" },
        checksum,
        updatedAt,
      })
    );

    const indexPath = path.join(this.configDir, "index.json");
    const index = await this.readJson<{ version: number; skills: unknown[] }>(indexPath);
    const installPath = path.join(projectAgentDir, name);
    index.skills.push({
      name,
      source: { type: "local" },
      checksum,
      updatedAt,
      installs: [
        {
          scope: "project",
          agent: "claude",
          path: installPath,
          projectRoot: this.projectDir,
        },
      ],
    });
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    await fs.mkdir(projectAgentDir, { recursive: true });
    await fs.symlink(skillDir, installPath);

    return skillDir;
  }

  async createUntrackedSkill(name: string, content: string): Promise<string> {
    const skillDir = path.join(this.agentSkillsDir, name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }

  async createExternalSkill(name: string, content: string): Promise<string> {
    const skillDir = path.join(this.testRoot, name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }
}
