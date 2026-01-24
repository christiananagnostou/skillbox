import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN, SKILL_MISSING_DESCRIPTION } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("import command", () => {
  describe("from path", () => {
    let skillPath: string;

    beforeEach(async () => {
      skillPath = await testEnv.createExternalSkill("import-test-skill", VALID_SKILL_MARKDOWN);
    });

    it("imports skill from directory", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; path: string };
      }>(["import", skillPath]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "import" });
      expect(data?.data.name).toBe("test-skill");
      expect(data?.data.path).toBe(skillPath);
    });

    it("skill appears in list after import", async () => {
      await runCli(["import", skillPath]);

      const { data } = await runCliJson<{
        data: { skills: Array<{ name: string; source: { type: string } }> };
      }>(["list"]);

      const skill = data?.data.skills.find((s) => s.name === "test-skill");
      expect(skill).toBeDefined();
      expect(skill?.source.type).toBe("local");
    });

    it("shows error for skill missing description", async () => {
      const invalidPath = await testEnv.createExternalSkill(
        "invalid-skill",
        SKILL_MISSING_DESCRIPTION
      );

      const result = await runCli(["import", invalidPath]);

      expect(result.stdout + result.stderr).toMatch(/description|missing/i);
    });

    it("shows error for non-existent path", async () => {
      const result = await runCli(["import", "/nonexistent/path"]);

      expect(result.stdout + result.stderr).toMatch(/not found|no such|error|enoent/i);
    });
  });

  describe("--global flag", () => {
    const UNTRACKED_SKILL = `---
name: untracked-skill
description: An untracked skill for testing
---
Content.`;

    beforeEach(async () => {
      await testEnv.createUntrackedSkill("untracked-skill", UNTRACKED_SKILL);
    });

    it("discovers and imports untracked skills", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { imported: string[]; skipped: string[] };
      }>(["import", "--global"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "import" });
      expect(data?.data.imported).toContain("untracked-skill");
    });

    it("skips already-tracked skills", async () => {
      // First import
      await runCli(["import", "--global"]);

      // Second import should skip
      const { data } = await runCliJson<{
        data: { imported: string[]; skipped: string[] };
      }>(["import", "--global"]);

      expect(data?.data.imported).not.toContain("untracked-skill");
      expect(data?.data.skipped).toContain("untracked-skill");
    });
  });

  describe("with --agents flag", () => {
    const AGENT_SKILL = `---
name: agent-specific-skill
description: Agent-specific skill
---
Content.`;

    beforeEach(async () => {
      await testEnv.createUntrackedSkill("agent-specific-skill", AGENT_SKILL);
    });

    it("scans only specified agent paths", async () => {
      const { result, data } = await runCliJson<{
        data: { imported: string[] };
      }>(["import", "--global", "--agents", "claude"]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.imported).toContain("agent-specific-skill");
    });
  });
});
