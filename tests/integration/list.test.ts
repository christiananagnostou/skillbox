import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN, SUBCOMMAND_ONE, SUBCOMMAND_TWO } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("list command", () => {
  describe("with no skills", () => {
    it("shows empty list", async () => {
      const result = await runCli(["list"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Global Skills|skills/i);
    });

    it("returns empty array with --json", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { skills: unknown[] };
      }>(["list"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "list" });
      expect(data?.data.skills).toEqual([]);
    });
  });

  describe("with skills", () => {
    beforeEach(async () => {
      await testEnv.installLocalSkill("test-skill", VALID_SKILL_MARKDOWN, {
        description: "A test skill",
      });
    });

    it("shows skill in list", async () => {
      const result = await runCli(["list"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test-skill");
    });

    it("returns skill data with --json", async () => {
      const { result, data } = await runCliJson<{
        data: { skills: Array<{ name: string; source: { type: string } }> };
      }>(["list"]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.skills).toHaveLength(1);
      expect(data?.data.skills[0].name).toBe("test-skill");
      expect(data?.data.skills[0].source.type).toBe("local");
    });
  });

  describe("with subcommands", () => {
    const MULTI_SKILL_CONTENT = `---
name: multi-skill
description: A skill with subcommands
---
Main skill.`;

    beforeEach(async () => {
      await testEnv.installLocalSkill("multi-skill", MULTI_SKILL_CONTENT, {
        description: "A skill with subcommands",
        subcommands: { one: SUBCOMMAND_ONE, two: SUBCOMMAND_TWO },
      });
    });

    it("shows subcommands in list output", async () => {
      const result = await runCli(["list"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("multi-skill");
      expect(result.stdout).toContain("→");
      expect(result.stdout).toContain("one");
      expect(result.stdout).toContain("two");
    });

    it("includes subcommands in JSON output", async () => {
      const { data } = await runCliJson<{
        data: { skills: Array<{ name: string; subcommands: string[] }> };
      }>(["list"]);

      expect(data?.data.skills[0].subcommands).toContain("one");
      expect(data?.data.skills[0].subcommands).toContain("two");
    });
  });

  describe("filtering", () => {
    it("filters by --global flag", async () => {
      const result = await runCli(["list", "--global"]);
      expect(result.exitCode).toBe(0);
    });

    it("filters by --agents flag", async () => {
      const result = await runCli(["list", "--agents", "claude"]);
      expect(result.exitCode).toBe(0);
    });
  });
});
