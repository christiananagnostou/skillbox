import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("meta set command", () => {
  beforeEach(async () => {
    // Create a local skill to test meta commands (avoids network dependency)
    const skillDir = path.join(testEnv.skillsDir, "test-meta-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL_MARKDOWN);
    await fs.writeFile(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        name: "test-meta-skill",
        version: "1.0.0",
        description: "A test skill for meta commands",
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
            name: "test-meta-skill",
            source: { type: "local" },
            checksum: "abc123",
            updatedAt: new Date().toISOString(),
            installs: [
              {
                scope: "user",
                agent: "claude",
                path: path.join(testEnv.agentSkillsDir, "test-meta-skill"),
              },
            ],
          },
        ],
      })
    );

    // Create symlink
    await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "test-meta-skill"));
  });

  it("sets category", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: { name: string; categories: string[] };
    }>(["meta", "set", "test-meta-skill", "--category", "design"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "meta set" });
    expect(data?.data.categories).toContain("design");
  });

  it("sets multiple tags", async () => {
    const { result, data } = await runCliJson<{
      data: { tags: string[] };
    }>(["meta", "set", "test-meta-skill", "--tag", "frontend", "--tag", "ui"]);

    expect(result.exitCode).toBe(0);
    expect(data?.data.tags).toContain("frontend");
    expect(data?.data.tags).toContain("ui");
  });

  it("sets namespace", async () => {
    const { result, data } = await runCliJson<{
      data: { namespace: string };
    }>(["meta", "set", "test-meta-skill", "--namespace", "testing"]);

    expect(result.exitCode).toBe(0);
    expect(data?.data.namespace).toBe("testing");
  });

  it("persists metadata to skill.json", async () => {
    await runCli([
      "meta",
      "set",
      "test-meta-skill",
      "--category",
      "design",
      "--tag",
      "test",
      "--namespace",
      "test-ns",
    ]);

    const skillJsonPath = path.join(testEnv.skillsDir, "test-meta-skill", "skill.json");
    const skillJson = await testEnv.readJson<{
      categories?: string[];
      tags?: string[];
      namespace?: string;
    }>(skillJsonPath);

    expect(skillJson.categories).toContain("design");
    expect(skillJson.tags).toContain("test");
    expect(skillJson.namespace).toBe("test-ns");
  });

  it("shows error for non-existent skill", async () => {
    const result = await runCli(["meta", "set", "nonexistent", "--category", "test"]);

    // Error message could be in stdout, stderr, or contain ENOENT
    expect(result.stdout + result.stderr).toMatch(/not found|error|enoent|no such/i);
  });
});
