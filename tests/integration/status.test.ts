import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { testEnv } from "../setup.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("status command", () => {
  describe("with no skills", () => {
    it("shows empty status", async () => {
      const result = await runCli(["status"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Skill Status");
    });

    it("returns empty data with --json", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: {
          total: number;
          outdated: number;
          upToDate: number;
          trackable: number;
          skills: unknown[];
        };
      }>(["status"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "status" });
      expect(data?.data.total).toBe(0);
      expect(data?.data.skills).toEqual([]);
    });
  });

  describe("with local skills", () => {
    beforeEach(async () => {
      // Create a local skill (avoids network dependency)
      const skillDir = path.join(testEnv.skillsDir, "local-status-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL_MARKDOWN);
      await fs.writeFile(
        path.join(skillDir, "skill.json"),
        JSON.stringify({
          name: "local-status-skill",
          version: "1.0.0",
          description: "A local skill for status testing",
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
              name: "local-status-skill",
              source: { type: "local" },
              checksum: "abc123",
              updatedAt: new Date().toISOString(),
              installs: [
                {
                  scope: "user",
                  agent: "claude",
                  path: path.join(testEnv.agentSkillsDir, "local-status-skill"),
                },
              ],
            },
          ],
        })
      );

      // Create symlink
      await fs.symlink(skillDir, path.join(testEnv.agentSkillsDir, "local-status-skill"));
    });

    it("shows skill in status", async () => {
      const result = await runCli(["status"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("local-status-skill");
    });

    it("returns skill status with --json", async () => {
      const { result, data } = await runCliJson<{
        data: {
          total: number;
          skills: Array<{
            name: string;
            source: string;
            trackable: boolean;
          }>;
        };
      }>(["status"]);

      expect(result.exitCode).toBe(0);
      expect(data?.data.total).toBe(1);

      const skill = data?.data.skills[0];
      expect(skill?.name).toBe("local-status-skill");
      expect(skill?.source).toBe("local");
      expect(skill?.trackable).toBe(false); // Local skills are not trackable
    });

    it("groups by source type", async () => {
      const { data } = await runCliJson<{
        data: {
          bySource: Array<{
            source: string;
            skills: unknown[];
            trackable: boolean;
          }>;
        };
      }>(["status"]);

      const localGroup = data?.data.bySource.find((g) => g.source === "local");
      expect(localGroup).toBeDefined();
      expect(localGroup?.trackable).toBe(false);
    });
  });
});
