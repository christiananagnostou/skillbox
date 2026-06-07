import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN, TEST_URLS } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("update command", () => {
  describe("with local skills", () => {
    beforeEach(async () => {
      await testEnv.installLocalSkill("local-update-skill", VALID_SKILL_MARKDOWN, {
        description: "A local skill for update testing",
      });
    });

    it("skips local skills (not trackable)", async () => {
      const { result, data } = await runCliJson<{
        data: {
          skipped: number;
          results: Array<{ name: string; status: string }>;
        };
      }>(["update"]);

      expect(result.exitCode).toBe(0);
      const localResult = data?.data.results.find((r) => r.name === "local-update-skill");
      expect(localResult?.status).toBe("skipped");
    });
  });

  describe("with url-sourced skills", () => {
    beforeEach(async () => {
      // Add skill from URL (this may fail due to network, but we handle it)
      await runCli(["add", TEST_URLS.validSkill]);
    });

    it("updates url-sourced skill when available", async () => {
      const { result, data } = await runCliJson<{
        data: {
          results: Array<{ name: string; source: string; status: string }>;
        };
      }>(["update"]);

      // If network is available and skill was added successfully
      if (result.exitCode === 0 && data?.data.results.length) {
        const urlResult = data?.data.results.find((r) => r.source === "url");
        if (urlResult) {
          expect(urlResult.status).toBe("updated");
        }
      }
    });
  });

  describe("error handling", () => {
    it("shows error for non-existent skill", async () => {
      const result = await runCli(["update", "nonexistent-skill"]);

      expect(result.stdout + result.stderr).toMatch(/not found|error/i);
    });
  });

  describe("with --project flag", () => {
    it("updates project installs only", async () => {
      await runCli(["config", "set", "--default-scope", "project"]);
      const { result: addResult, data: addData } = await runCliJson<{
        ok: boolean;
        data?: { name: string };
        error?: { message: string };
      }>(["add", TEST_URLS.validSkill, "--name", "project-update-skill"], {
        cwd: testEnv.projectDir,
      });

      if (addResult.exitCode !== 0 || addData?.ok === false) {
        expect(addResult.stdout + addResult.stderr).toMatch(/error|failed|rate|network|fetch/i);
        return;
      }

      const { result, data } = await runCliJson<{
        data: {
          project: string | null;
          results: Array<{ name: string; status: string }>;
        };
      }>(["update", "project-update-skill", "--project", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.project).toBe(testEnv.projectDir);
      const updated = data?.data.results.find((entry) => entry.name === "project-update-skill");
      expect(updated?.status).not.toBe("skipped");
    });
  });

  describe("progress output (human-readable)", () => {
    beforeEach(async () => {
      await testEnv.installLocalSkill("progress-test-skill", VALID_SKILL_MARKDOWN, {
        description: "A skill for testing progress output",
      });
    });

    it("shows header with skill count", async () => {
      const result = await runCli(["update"]);

      expect(result.stdout).toMatch(/Updating \d+ skills?\.\.\./);
    });

    it("shows dash indicator for skipped local skills", async () => {
      const result = await runCli(["update"]);

      expect(result.stdout).toMatch(/^\s+-\s+progress-test-skill \(skipped\)/m);
    });

    it("shows summary line", async () => {
      const result = await runCli(["update"]);

      expect(result.stdout).toMatch(/No trackable skills to update\.|Updated \d+ of \d+/);
    });

    it("shows checkmark for successful updates", async () => {
      // Add a URL skill first
      const addResult = await runCli(["add", TEST_URLS.validSkill, "--name", "url-progress-skill"]);

      if (addResult.exitCode !== 0) {
        // Network issue, skip this test
        expect(addResult.stdout + addResult.stderr).toMatch(/error|failed|rate|network|fetch/i);
        return;
      }

      const result = await runCli(["update", "url-progress-skill"]);

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/✓\s+url-progress-skill/);
      }
    });

    it("shows X indicator for failed updates", async () => {
      // Add a skill with a URL that will fail
      await testEnv.addSkillToIndex({
        name: "broken-url-skill",
        source: { type: "url", url: "https://invalid.example.com/nonexistent.md" },
      });

      const result = await runCli(["update", "broken-url-skill"]);

      expect(result.stdout).toMatch(/✗\s+broken-url-skill/);
    });

    it("does not show progress output in JSON mode", async () => {
      const result = await runCli(["update", "--json"]);

      expect(result.stdout).not.toMatch(/Updating \d+ skills?\.\.\./);
      expect(result.stdout).not.toMatch(/[✓✗-]\s+progress-test-skill/);
      // Should be valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });
});
