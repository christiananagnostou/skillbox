import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("project command", () => {
  describe("project add", () => {
    it("registers a project", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { path: string; agentPaths: Record<string, string[]>; skills: string[] };
      }>(["project", "add", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "project add" });
      expect(data?.data.path).toBe(testEnv.projectDir);
    });

    it("auto-discovers skills in skills/ directory", async () => {
      // Create a skill in the project
      const skillDir = path.join(testEnv.projectDir, "skills", "project-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---
name: project-skill
description: A project skill
---
Content.`
      );

      const { result, data } = await runCliJson<{
        data: { skills: string[] };
      }>(["project", "add", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.skills).toContain("project-skill");
    });

    it("accepts custom agent paths with --agent-path", async () => {
      const customPath = path.join(testEnv.projectDir, "custom-skills");
      await fs.mkdir(customPath, { recursive: true });

      const { result, data } = await runCliJson<{
        data: { agentPaths: Record<string, string[]> };
      }>(["project", "add", testEnv.projectDir, "--agent-path", `claude=${customPath}`]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.agentPaths.claude).toContain(customPath);
    });
  });

  describe("project list", () => {
    beforeEach(async () => {
      await runCli(["project", "add", testEnv.projectDir]);
    });

    it("lists registered projects", async () => {
      const result = await runCli(["project", "list"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testEnv.projectDir);
    });

    it("returns project list with --json", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: {
          projects: Array<{
            root: string;
            agentPaths: Record<string, string[]>;
            skills: string[];
          }>;
        };
      }>(["project", "list"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "project list" });
      expect(data?.data.projects).toHaveLength(1);
      expect(data?.data.projects[0].root).toBe(testEnv.projectDir);
    });
  });

  describe("project inspect", () => {
    beforeEach(async () => {
      await runCli(["project", "add", testEnv.projectDir]);
    });

    it("shows project details", async () => {
      const result = await runCli(["project", "inspect", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testEnv.projectDir);
    });

    it("returns project details with --json", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: {
          root: string;
          agentPaths: Record<string, string[]>;
          skills: string[];
        };
      }>(["project", "inspect", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "project inspect" });
      expect(data?.data.root).toBe(testEnv.projectDir);
    });

    it("shows error for non-registered project", async () => {
      const result = await runCli(["project", "inspect", "/nonexistent/project"]);

      expect(result.stdout + result.stderr).toMatch(/not registered|not found|error/i);
    });
  });

  describe("project sync", () => {
    beforeEach(async () => {
      // Create project with skill
      const skillDir = path.join(testEnv.projectDir, "skills", "sync-test-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---
name: sync-test-skill
description: A skill for sync testing
---
Content.`
      );

      await runCli(["project", "add", testEnv.projectDir]);
    });

    it("syncs project skills", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { root: string; skills: string[] };
      }>(["project", "sync", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "project sync" });
      expect(data?.data.skills).toContain("sync-test-skill");
    });

    it("shows error for non-registered project", async () => {
      const result = await runCli(["project", "sync", "/nonexistent/project"]);

      expect(result.stdout + result.stderr).toMatch(/not registered|not found|no skills|error/i);
    });
  });
});
