import { describe, it, expect } from "vitest";
import { isProjectInstall, isUserInstall } from "../../src/lib/installs.js";
import type { SkillInstall } from "../../src/lib/types.js";

const userInstall: SkillInstall = {
  scope: "user",
  agent: "claude",
  path: "/home/u/.claude/skills/foo",
};

const projectInstall: SkillInstall = {
  scope: "project",
  agent: "claude",
  path: "/home/u/proj/.claude/skills/foo",
  projectRoot: "/home/u/proj",
};

const projectInstallMissingRoot: SkillInstall = {
  scope: "project",
  agent: "claude",
  path: "/home/u/proj/.claude/skills/foo",
};

describe("isProjectInstall", () => {
  it("returns true for project installs with projectRoot", () => {
    expect(isProjectInstall(projectInstall)).toBe(true);
  });

  it("returns false for project installs without projectRoot", () => {
    expect(isProjectInstall(projectInstallMissingRoot)).toBe(false);
  });

  it("returns false for user installs", () => {
    expect(isProjectInstall(userInstall)).toBe(false);
  });
});

describe("isUserInstall", () => {
  it("returns true for user installs", () => {
    expect(isUserInstall(userInstall)).toBe(true);
  });

  it("returns false for project installs", () => {
    expect(isUserInstall(projectInstall)).toBe(false);
  });
});
