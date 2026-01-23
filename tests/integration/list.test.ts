import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN, SUBCOMMAND_ONE, SUBCOMMAND_TWO } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("list command", () => {
  describe("with no skills", () => {
    it("shows empty list", async () => {
      const result = await runCli(["list"]);

      expect(result.exitCode).toBe(0);
      // Either shows "(0)" or empty skills section
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
      // Create a test skill in the store
      const skillDir = path.join(testEnv.skillsDir, "test-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL_MARKDOWN);
      await fs.writeFile(
        path.join(skillDir, "skill.json"),
        JSON.stringify({
          name: "test-skill",
          version: "1.0.0",
          description: "A test skill",
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
              name: "test-skill",
              source: { type: "local" },
              checksum: "abc123",
              updatedAt: new Date().toISOString(),
              installs: [
                {
                  scope: "user",
                  agent: "claude",
                  path: path.join(testEnv.agentSkillsDir, "test-skill"),
                },
              ],
            },
          ],
        })
      );

      // Create symlink
      await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "test-skill"));
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
    beforeEach(async () => {
      // Create a skill with subcommands
      const skillDir = path.join(testEnv.skillsDir, "multi-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---
name: multi-skill
description: A skill with subcommands
---
Main skill.`
      );
      await fs.writeFile(path.join(skillDir, "one.md"), SUBCOMMAND_ONE);
      await fs.writeFile(path.join(skillDir, "two.md"), SUBCOMMAND_TWO);
      await fs.writeFile(
        path.join(skillDir, "skill.json"),
        JSON.stringify({
          name: "multi-skill",
          version: "1.0.0",
          description: "A skill with subcommands",
          entry: "SKILL.md",
          source: { type: "local" },
          checksum: "def456",
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
              name: "multi-skill",
              source: { type: "local" },
              checksum: "def456",
              updatedAt: new Date().toISOString(),
              installs: [
                {
                  scope: "user",
                  agent: "claude",
                  path: path.join(testEnv.agentSkillsDir, "multi-skill"),
                },
              ],
            },
          ],
        })
      );

      // Create symlink
      await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "multi-skill"));
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
