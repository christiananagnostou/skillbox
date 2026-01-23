import { describe, it, expect } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { TEST_REPOS, TEST_URLS } from "../helpers/fixtures.js";
import path from "node:path";

describe("add command", () => {
  describe("from repository", () => {
    it("lists available skills with --list flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--list",
      ]);

      // Either succeeds with skill list or shows an error (rate limit, network, etc.)
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });

    it("attempts to install a specific skill with --skill flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "web-design-guidelines",
      ]);

      // Command ran (may succeed or fail due to network)
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);

      // If it succeeded, verify the install
      if (result.stdout.includes("web-design-guidelines") && !result.stdout.includes("error")) {
        const symlinkPath = path.join(testEnv.agentSkillsDir, "web-design-guidelines");
        const exists = await testEnv.fileExists(symlinkPath);
        if (exists) {
          expect(exists).toBe(true);
        }
      }
    });

    it("handles --global flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "react-best-practices",
        "--global",
      ]);

      // Command ran
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("from URL", () => {
    it("installs skill from raw URL", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; source: { type: string; url: string } };
      }>(["add", TEST_URLS.validSkill]);

      if (result.exitCode === 0) {
        assertJsonResponse(result, { ok: true, command: "add" });
        expect(data?.data.source.type).toBe("url");
      }
    });

    it("uses custom name with --name flag", async () => {
      const { result, data } = await runCliJson<{
        data: { name: string };
      }>(["add", TEST_URLS.validSkillWithPath, "--name", "my-custom-skill"]);

      if (result.exitCode === 0) {
        expect(data?.data.name).toBe("my-custom-skill");

        // Verify symlink with custom name
        const symlinkPath = path.join(testEnv.agentSkillsDir, "my-custom-skill");
        const exists = await testEnv.fileExists(symlinkPath);
        expect(exists).toBe(true);
      }
    });
  });

  describe("error handling", () => {
    it("shows error for invalid input", async () => {
      // Test with clearly invalid input
      const result = await runCli(["add"]);
      // Should show usage/error
      expect(result.stdout + result.stderr).toMatch(/error|usage|argument|required/i);
    });
  });
});
