import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("remove command", () => {
  beforeEach(async () => {
    await testEnv.installLocalSkill("removable-skill", VALID_SKILL_MARKDOWN, {
      description: "A skill to remove",
    });
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
