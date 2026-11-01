import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { runCli, runCliJson } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

let server: http.Server;
let fixtureUrl: string;
let fixtureContent: string;
let fixtureStatus: number;
beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(fixtureStatus, { "content-type": "text/plain" });
    response.end(fixtureContent);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture server address");
  fixtureUrl = `http://127.0.0.1:${address.port}/SKILL.md`;
});
beforeEach(() => {
  fixtureContent = VALID_SKILL_MARKDOWN;
  fixtureStatus = 200;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

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
      const added = await runCli(["add", fixtureUrl, "--name", "url-test"]);
      expect(added.exitCode, added.stdout + added.stderr).toBe(0);
      fixtureContent = VALID_SKILL_MARKDOWN + "\nUpdated content\n";
    });

    it("updates url-sourced skill from a controlled server", async () => {
      const { result, data } = await runCliJson<{
        data: {
          results: Array<{ name: string; source: string; status: string }>;
        };
      }>(["update"]);

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(data?.data.results).toContainEqual(
        expect.objectContaining({ name: "url-test", source: "url", status: "updated" })
      );
      expect(
        await fs.readFile(path.join(testEnv.skillsDir, "url-test", "SKILL.md"), "utf8")
      ).toContain("Updated content");
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
      await fs.mkdir(path.join(testEnv.projectDir, ".git"));
      await runCli(["config", "set", "--default-scope", "project"]);
      const { result: addResult, data: addData } = await runCliJson<{
        ok: boolean;
        data?: { name: string };
        error?: { message: string };
      }>(["add", fixtureUrl, "--name", "project-update-skill"], {
        cwd: testEnv.projectDir,
      });

      expect(addResult.exitCode, addResult.stdout + addResult.stderr).toBe(0);
      expect(addData?.ok).toBe(true);
      fixtureContent += "\nProject updated content\n";

      const { result, data } = await runCliJson<{
        data: {
          project: string | null;
          results: Array<{ name: string; status: string }>;
        };
      }>(["update", "project-update-skill", "--project", testEnv.projectDir]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.project).toBe(testEnv.projectDir);
      const updated = data?.data.results.find((entry) => entry.name === "project-update-skill");
      expect(updated?.status).toBe("updated");
      expect(
        await fs.readFile(
          path.join(testEnv.projectDir, ".claude", "skills", "project-update-skill", "SKILL.md"),
          "utf8"
        )
      ).toContain("Project updated content");
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
      const addResult = await runCli(["add", fixtureUrl, "--name", "url-progress-skill"]);

      expect(addResult.exitCode, addResult.stdout + addResult.stderr).toBe(0);
      const result = await runCli(["update", "url-progress-skill"]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toMatch(/✓\s+url-progress-skill/);
    });

    it("shows X indicator for failed updates", async () => {
      // Add a skill with a URL that will fail
      await testEnv.addSkillToIndex({
        name: "broken-url-skill",
        source: { type: "url", url: fixtureUrl },
      });

      fixtureStatus = 503;
      const result = await runCli(["update", "broken-url-skill"]);
      expect(result.exitCode).not.toBe(0);

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
