import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN, SKILL_MISSING_DESCRIPTION } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("import command", () => {
  describe("from path", () => {
    let skillPath: string;

    beforeEach(async () => {
      // Create a skill directory to import
      skillPath = path.join(testEnv.testRoot, "import-test-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), VALID_SKILL_MARKDOWN);
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
      const invalidPath = path.join(testEnv.testRoot, "invalid-skill");
      await fs.mkdir(invalidPath, { recursive: true });
      await fs.writeFile(path.join(invalidPath, "SKILL.md"), SKILL_MISSING_DESCRIPTION);

      const result = await runCli(["import", invalidPath]);

      expect(result.stdout + result.stderr).toMatch(/description|missing/i);
    });

    it("shows error for non-existent path", async () => {
      const result = await runCli(["import", "/nonexistent/path"]);

      expect(result.stdout + result.stderr).toMatch(/not found|no such|error|enoent/i);
    });
  });

  describe("--global flag", () => {
    beforeEach(async () => {
      // Create an untracked skill directly in agent folder
      const untrackedPath = path.join(testEnv.agentSkillsDir, "untracked-skill");
      await fs.mkdir(untrackedPath, { recursive: true });
      await fs.writeFile(
        path.join(untrackedPath, "SKILL.md"),
        `---
name: untracked-skill
description: An untracked skill for testing
---
Content.`
      );
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
    beforeEach(async () => {
      // Create untracked skill in claude folder
      const untrackedPath = path.join(testEnv.agentSkillsDir, "agent-specific-skill");
      await fs.mkdir(untrackedPath, { recursive: true });
      await fs.writeFile(
        path.join(untrackedPath, "SKILL.md"),
        `---
name: agent-specific-skill
description: Agent-specific skill
---
Content.`
      );
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
