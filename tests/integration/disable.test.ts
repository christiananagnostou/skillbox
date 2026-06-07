import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { VALID_SKILL_MARKDOWN } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("disable command", () => {
  beforeEach(async () => {
    await testEnv.installLocalSkill("disable-skill", VALID_SKILL_MARKDOWN, {
      description: "A skill to disable",
    });
  });

  it("disables a skill and removes install paths", async () => {
    const symlinkPath = path.join(testEnv.agentSkillsDir, "disable-skill");
    expect(await testEnv.fileExists(symlinkPath)).toBe(true);

    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: { name: string; removedPaths: string[]; installs: number };
    }>(["disable", "disable-skill"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "disable" });
    expect(data?.data.name).toBe("disable-skill");
    expect(data?.data.removedPaths.length).toBeGreaterThan(0);

    // Symlink should be removed
    expect(await testEnv.fileExists(symlinkPath)).toBe(false);

    // Canonical store should still exist
    const canonicalPath = path.join(testEnv.skillsDir, "disable-skill");
    expect(await testEnv.fileExists(canonicalPath)).toBe(true);
  });

  it("marks skill as disabled in index", async () => {
    await runCli(["disable", "disable-skill"]);

    const { data } = await runCliJson<{
      data: { skills: Array<{ name: string; disabled?: boolean }> };
    }>(["list"]);

    const skill = data?.data.skills.find((s) => s.name === "disable-skill");
    expect(skill?.disabled).toBe(true);
  });

  it("shows error for non-existent skill", async () => {
    const result = await runCli(["disable", "nonexistent-skill"]);

    expect(result.stdout + result.stderr).toMatch(/not found|error/i);
  });

  it("shows error when skill is already disabled", async () => {
    await runCli(["disable", "disable-skill"]);
    const result = await runCli(["disable", "disable-skill"]);

    expect(result.stdout + result.stderr).toMatch(/already disabled|error/i);
  });

  it("disables a skill in human-readable mode", async () => {
    const result = await runCli(["disable", "disable-skill"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Disabled: disable-skill");
  });
});

describe("enable command", () => {
  beforeEach(async () => {
    await testEnv.installLocalSkill("enable-skill", VALID_SKILL_MARKDOWN, {
      description: "A skill to enable",
    });
    // Disable it first
    await runCli(["disable", "enable-skill"]);
  });

  it("enables a disabled skill and restores installs", async () => {
    const symlinkPath = path.join(testEnv.agentSkillsDir, "enable-skill");
    expect(await testEnv.fileExists(symlinkPath)).toBe(false);

    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: { name: string; installed: number };
    }>(["enable", "enable-skill"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "enable" });
    expect(data?.data.name).toBe("enable-skill");
    expect(data?.data.installed).toBeGreaterThan(0);

    // Symlink should be restored
    expect(await testEnv.fileExists(symlinkPath)).toBe(true);
  });

  it("clears disabled flag in index", async () => {
    await runCli(["enable", "enable-skill"]);

    const { data } = await runCliJson<{
      data: { skills: Array<{ name: string; disabled?: boolean }> };
    }>(["list"]);

    const skill = data?.data.skills.find((s) => s.name === "enable-skill");
    expect(skill?.disabled).toBeUndefined();
  });

  it("shows error for non-existent skill", async () => {
    const result = await runCli(["enable", "nonexistent-skill"]);

    expect(result.stdout + result.stderr).toMatch(/not found|error/i);
  });

  it("shows error when skill is not disabled", async () => {
    await runCli(["enable", "enable-skill"]); // Re-enable first
    const result = await runCli(["enable", "enable-skill"]);

    expect(result.stdout + result.stderr).toMatch(/not disabled|error/i);
  });

  it("enables a skill in human-readable mode", async () => {
    const result = await runCli(["enable", "enable-skill"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Enabled: enable-skill");
  });
});
