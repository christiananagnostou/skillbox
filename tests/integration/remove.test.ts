import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("remove command", () => {
  beforeEach(async () => {
    // Create a local skill to remove (avoids network dependency)
    const skillDir = path.join(testEnv.skillsDir, "removable-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL_MARKDOWN);
    await fs.writeFile(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        name: "removable-skill",
        version: "1.0.0",
        description: "A skill to remove",
        entry: "SKILL.md",
        source: { type: "local" },
        checksum: "abc123",
        updatedAt: new Date().toISOString(),
      })
    );

    // Add to index
    const indexPath = path.join(testEnv.configDir, "index.json");
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        skills: [
          {
            name: "removable-skill",
            source: { type: "local" },
            checksum: "abc123",
            updatedAt: new Date().toISOString(),
            installs: [
              {
                scope: "user",
                agent: "claude",
                path: path.join(testEnv.agentSkillsDir, "removable-skill"),
              },
            ],
          },
        ],
      })
    );

    // Create symlink
    await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "removable-skill"));
  });

  it("removes a skill", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: {
        name: string;
        removed: Array<{ scope: string; agent: string; path: string }>;
        removedCanonical: boolean;
      };
    }>(["remove", "removable-skill"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "remove" });
    expect(data?.data.name).toBe("removable-skill");
    expect(data?.data.removedCanonical).toBe(true);

    // Verify symlink was removed
    const symlinkPath = path.join(testEnv.agentSkillsDir, "removable-skill");
    const exists = await testEnv.fileExists(symlinkPath);
    expect(exists).toBe(false);
  });

  it("removes skill from list", async () => {
    await runCli(["remove", "removable-skill"]);

    const { data } = await runCliJson<{
      data: { skills: Array<{ name: string }> };
    }>(["list"]);

    const skillNames = data?.data.skills.map((s) => s.name) ?? [];
    expect(skillNames).not.toContain("removable-skill");
  });

  it("shows error for non-existent skill", async () => {
    const result = await runCli(["remove", "nonexistent-skill"]);

    expect(result.stdout + result.stderr).toMatch(/not found|error/i);
  });
});
