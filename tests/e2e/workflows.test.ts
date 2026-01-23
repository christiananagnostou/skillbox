import { describe, it, expect } from "vitest";
import { runCli, runCliJson } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("E2E Workflows", () => {
  describe("complete local skill lifecycle", () => {
    it("import → list → remove", async () => {
      // Create skill to import
      const skillPath = path.join(testEnv.testRoot, "lifecycle-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), VALID_SKILL_MARKDOWN);

      // Import skill
      const importResult = await runCli(["import", skillPath]);
      expect(importResult.exitCode).toBe(0);

      // Verify in list
      const { data: listData } = await runCliJson<{
        data: { skills: Array<{ name: string }> };
      }>(["list"]);
      const skillNames = listData?.data.skills.map((s) => s.name) ?? [];
      expect(skillNames).toContain("test-skill");

      // Remove skill
      const removeResult = await runCli(["remove", "test-skill"]);
      expect(removeResult.exitCode).toBe(0);

      // No longer in list
      const { data: finalListData } = await runCliJson<{
        data: { skills: Array<{ name: string }> };
      }>(["list"]);
      const finalSkillNames = finalListData?.data.skills.map((s) => s.name) ?? [];
      expect(finalSkillNames).not.toContain("test-skill");
    });
  });

  describe("project workflow", () => {
    it("register → add skills → list", async () => {
      // Create project with skill directory
      const skillDir = path.join(testEnv.projectDir, "skills", "my-project-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---
name: my-project-skill
description: A project-specific skill
---
Content.`
      );

      // Register project (auto-discovers skill)
      const addResult = await runCliJson<{
        data: { skills: string[] };
      }>(["project", "add", testEnv.projectDir]);
      expect(addResult.result.exitCode).toBe(0);
      expect(addResult.data?.data.skills).toContain("my-project-skill");

      // Verify project in list
      const listResult = await runCliJson<{
        data: { projects: Array<{ root: string; skills: string[] }> };
      }>(["project", "list"]);
      const project = listResult.data?.data.projects.find((p) => p.root === testEnv.projectDir);
      expect(project).toBeDefined();
      expect(project?.skills).toContain("my-project-skill");
    });
  });

  describe("config persistence", () => {
    it("config changes persist across commands", async () => {
      // Change config
      await runCli(["config", "set", "--default-scope", "project"]);
      await runCli(["config", "set", "--install-mode", "copy"]);
      await runCli(["config", "set", "--add-agent", "cursor"]);

      // Verify changes persisted
      const { data } = await runCliJson<{
        data: {
          defaultScope: string;
          installMode: string;
          defaultAgents: string[];
        };
      }>(["config", "get"]);

      expect(data?.data.defaultScope).toBe("project");
      expect(data?.data.installMode).toBe("copy");
      expect(data?.data.defaultAgents).toContain("cursor");

      // Reset for other tests
      await runCli(["config", "set", "--default-scope", "user"]);
      await runCli(["config", "set", "--install-mode", "symlink"]);
      await runCli(["config", "set", "--default-agent", "claude"]);
    });
  });

  describe("error recovery", () => {
    it("gracefully handles invalid operations", async () => {
      // Remove non-existent skill shows error message
      const removeResult = await runCli(["remove", "nonexistent"]);
      expect(removeResult.stdout + removeResult.stderr).toMatch(/not found|error/i);

      // Update non-existent skill shows error message
      const updateResult = await runCli(["update", "nonexistent"]);
      expect(updateResult.stdout + updateResult.stderr).toMatch(/not found|error/i);

      // System should still work after errors
      const listResult = await runCli(["list"]);
      expect(listResult.exitCode).toBe(0);
    });
  });

  describe("global import workflow", () => {
    it("discovers and imports untracked skills", async () => {
      // Create untracked skill in agent folder
      const untrackedPath = path.join(testEnv.agentSkillsDir, "untracked-workflow-skill");
      await fs.mkdir(untrackedPath, { recursive: true });
      await fs.writeFile(
        path.join(untrackedPath, "SKILL.md"),
        `---
name: untracked-workflow-skill
description: An untracked skill
---
Content.`
      );

      // Import global
      const importResult = await runCliJson<{
        data: { imported: string[] };
      }>(["import", "--global"]);
      expect(importResult.result.exitCode).toBe(0);
      expect(importResult.data?.data.imported).toContain("untracked-workflow-skill");

      // Verify in list
      const { data } = await runCliJson<{
        data: { skills: Array<{ name: string }> };
      }>(["list"]);
      const skillNames = data?.data.skills.map((s) => s.name) ?? [];
      expect(skillNames).toContain("untracked-workflow-skill");
    });
  });
});
