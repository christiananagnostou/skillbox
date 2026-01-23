import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

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
      await testEnv.installLocalSkill("local-status-skill", VALID_SKILL_MARKDOWN, {
        description: "A local skill for status testing",
      });
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
