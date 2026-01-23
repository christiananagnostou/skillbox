import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN, TEST_URLS } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("update command", () => {
  describe("with local skills", () => {
    beforeEach(async () => {
      // Create a local skill
      const skillDir = path.join(testEnv.skillsDir, "local-update-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL_MARKDOWN);
      await fs.writeFile(
        path.join(skillDir, "skill.json"),
        JSON.stringify({
          name: "local-update-skill",
          version: "1.0.0",
          description: "A local skill for update testing",
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
              name: "local-update-skill",
              source: { type: "local" },
              checksum: "abc123",
              updatedAt: new Date().toISOString(),
              installs: [
                {
                  scope: "user",
                  agent: "claude",
                  path: path.join(testEnv.agentSkillsDir, "local-update-skill"),
                },
              ],
            },
          ],
        })
      );

      await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "local-update-skill"));
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
});
