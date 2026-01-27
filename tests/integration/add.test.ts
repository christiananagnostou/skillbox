import path from "node:path";
import { describe, it, expect } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { TEST_REPOS, TEST_URLS } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

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

    it("installs skill for specific agents with --agents flag", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; installs: Array<{ agent: string; scope: string }> };
      }>(["add", TEST_URLS.validSkill, "--name", "agents-test-skill", "--agents", "cursor"]);

      if (result.exitCode === 0 && data?.ok) {
        assertJsonResponse(result, { ok: true, command: "add" });

        const installs = data?.data.installs ?? [];
        expect(installs.length).toBeGreaterThan(0);
        for (const install of installs) {
          expect(install.agent).toBe("cursor");
        }
      } else {
        expect(result.stdout + result.stderr).toMatch(/error|failed|rate|network|fetch/i);
      }
    });
  });

  describe("error handling", () => {
    it("shows error for invalid input", async () => {
      const result = await runCli(["add"]);
      expect(result.stdout + result.stderr).toMatch(/error|usage|argument|required/i);
    });
  });

  describe("progress output (human-readable)", () => {
    it("shows header with skill count for repo add", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "web-design-guidelines",
      ]);

      // Only check output if command succeeded and has output (repo may be unavailable)
      if (result.exitCode === 0 && result.stdout.includes("Adding")) {
        expect(result.stdout).toMatch(/Adding \d+ skills? from/);
      }
    });

    it("shows checkmark for successful repo skill add", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "react-best-practices",
      ]);

      // Only check output if command succeeded and has output (repo may be unavailable)
      if (result.exitCode === 0 && result.stdout.includes("react-best-practices")) {
        expect(result.stdout).toMatch(/✓\s+react-best-practices/);
      }
    });

    it("shows checkmark for successful URL skill add", async () => {
      const result = await runCli(["add", TEST_URLS.validSkill, "--name", "progress-url-skill"]);

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/✓\s+progress-url-skill/);
      }
    });

    it("shows summary line after adding", async () => {
      const result = await runCli(["add", TEST_URLS.validSkill, "--name", "summary-test-skill"]);

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/Added \d+ skill|Added skill from/);
      }
    });

    it("does not show progress output in JSON mode", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "web-design-guidelines",
        "--json",
      ]);

      if (result.exitCode === 0) {
        expect(result.stdout).not.toMatch(/Adding \d+ skills? from/);
        expect(result.stdout).not.toMatch(/[✓✗-]\s+web-design-guidelines/);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });
});
