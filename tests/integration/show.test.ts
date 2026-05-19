import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN, VALID_SKILL_WITH_SUBCOMMANDS } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("show command", () => {
  beforeEach(async () => {
    await testEnv.installLocalSkill("show-skill", VALID_SKILL_MARKDOWN, {
      description: "A skill to show",
    });
  });

  it("shows skill details in JSON mode", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: {
        name: string;
        description: string;
        source: { type: string };
        content: string;
        subcommands: string[];
        extraFiles: string[];
        installs: Array<{ scope: string; agent: string }>;
      };
    }>(["show", "show-skill"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "show" });
    expect(data?.data.name).toBe("show-skill");
    expect(data?.data.description).toBe("A skill to show");
    expect(data?.data.source.type).toBe("local");
    expect(data?.data.content).toContain("test skill");
    expect(data?.data.subcommands).toEqual([]);
    expect(data?.data.installs.length).toBeGreaterThan(0);
  });

  it("shows skill details in human-readable mode", async () => {
    const result = await runCli(["show", "show-skill"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("show-skill");
    expect(result.stdout).toContain("Source: local");
    expect(result.stdout).toContain("Updated:");
  });

  it("shows error for non-existent skill", async () => {
    const result = await runCli(["show", "nonexistent-skill"]);

    expect(result.stdout + result.stderr).toMatch(/not found|error/i);
  });

  it("shows error for non-existent skill in JSON mode", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      error: { message: string };
    }>(["show", "nonexistent-skill"]);

    assertJsonResponse(result, { ok: false, command: "show" });
    expect((data as Record<string, unknown>)?.error).toBeDefined();
  });

  it("shows subcommands when present", async () => {
    await testEnv.installLocalSkill("multi-skill", VALID_SKILL_WITH_SUBCOMMANDS, {
      description: "A skill with subcommands",
      subcommands: {
        one: "# Subcommand One\nFirst subcommand.",
        two: "# Subcommand Two\nSecond subcommand.",
      },
    });

    const { data } = await runCliJson<{
      data: {
        subcommands: string[];
        extraFiles: string[];
      };
    }>(["show", "multi-skill"]);

    expect(data?.data.subcommands).toContain("one");
    expect(data?.data.subcommands).toContain("two");
  });

  it("shows subcommands in human-readable mode", async () => {
    await testEnv.installLocalSkill("multi-skill-hr", VALID_SKILL_WITH_SUBCOMMANDS, {
      description: "A skill with subcommands",
      subcommands: {
        alpha: "# Alpha\nAlpha subcommand.",
        beta: "# Beta\nBeta subcommand.",
      },
    });

    const result = await runCli(["show", "multi-skill-hr"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Subcommands (2)");
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("beta");
  });

  it("shows install information", async () => {
    const { data } = await runCliJson<{
      data: {
        installs: Array<{ scope: string; agent: string; path: string }>;
      };
    }>(["show", "show-skill"]);

    const installs = data?.data.installs ?? [];
    expect(installs.length).toBeGreaterThan(0);
    expect(installs[0].scope).toBe("user");
    expect(installs[0].agent).toBe("claude");
  });

  it("renders content in human-readable mode", async () => {
    const result = await runCli(["show", "show-skill"]);

    expect(result.exitCode).toBe(0);
    // Content section should include the SKILL.md body
    expect(result.stdout).toContain("Test Skill");
  });
});
