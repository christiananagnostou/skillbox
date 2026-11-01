import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { testEnv } from "../setup.js";
import { assertCanonicalReplaceable } from "../../src/lib/managed-guard.js";
import { writeManagedManifest } from "../../src/lib/managed-manifest.js";
import { saveIndex } from "../../src/lib/index.js";
import { installSkillToTargets } from "../../src/lib/sync.js";
import { loadConfig } from "../../src/lib/config.js";

const source = { type: "git" as const, repo: "fixture/repo", path: "skills/demo", ref: "main" };
async function canonical(): Promise<string> {
  const directory = await testEnv.createSkillDir("demo", "original");
  await writeManagedManifest(directory);
  await saveIndex({ version: 1, skills: [{ name: "demo", source, checksum: "", updatedAt: "" }] });
  return directory;
}

describe("canonical replacement ownership", () => {
  it("permits a clean indexed skill from the same source", async () => {
    await canonical();
    await expect(assertCanonicalReplaceable("demo", source)).resolves.toBeUndefined();
  });
  it("refuses local additions and preserves them", async () => {
    const directory = await canonical();
    await fs.writeFile(path.join(directory, "personal.md"), "do not delete");
    await expect(assertCanonicalReplaceable("demo", source)).rejects.toThrow(
      "local files have changed"
    );
    expect(await fs.readFile(path.join(directory, "personal.md"), "utf8")).toBe("do not delete");
  });
  it("refuses a forged manifest without index ownership", async () => {
    const directory = await testEnv.createSkillDir("demo", "original");
    await writeManagedManifest(directory);
    await expect(assertCanonicalReplaceable("demo", source)).rejects.toThrow(
      "not indexed to this source"
    );
  });
  it("refuses source collisions", async () => {
    await canonical();
    await expect(
      assertCanonicalReplaceable("demo", { ...source, repo: "other/repo" })
    ).rejects.toThrow("not indexed to this source");
  });
  it("refuses an unproven legacy canonical", async () => {
    const directory = await canonical();
    await fs.rm(path.join(directory, ".skillbox-manifest.json"));
    await expect(assertCanonicalReplaceable("demo", source)).rejects.toThrow("no managed baseline");
  });
});

describe("copy target ownership", () => {
  it("preserves an unrelated occupied target even with a valid manifest", async () => {
    await canonical();
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "personal.md"), "mine");
    await writeManagedManifest(target);
    const [result] = await installSkillToTargets("demo", [target], {
      ...(await loadConfig()),
      installMode: "copy",
    });
    expect(result.mode).toBe("skipped");
    expect(result.error).toContain("untracked install");
    expect(await fs.readFile(path.join(target, "personal.md"), "utf8")).toBe("mine");
  });
  it("preserves local edits in a tracked copied target", async () => {
    const directory = await canonical();
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.cp(directory, target, { recursive: true });
    await saveIndex({
      version: 1,
      skills: [
        {
          name: "demo",
          source,
          checksum: "",
          updatedAt: "",
          installs: [{ scope: "user", agent: "claude", path: target }],
        },
      ],
    });
    await fs.writeFile(path.join(target, "personal.md"), "mine");
    const [result] = await installSkillToTargets("demo", [target], {
      ...(await loadConfig()),
      installMode: "copy",
    });
    expect(result.mode).toBe("skipped");
    expect(result.error).toContain("locally modified");
    expect(await fs.readFile(path.join(target, "personal.md"), "utf8")).toBe("mine");
  });
});

it.each(["", ".", "..", "../other", "a/b", "a\\b", "a\0b"])(
  "rejects unsafe skill name %j before filesystem work",
  async (name) => {
    await expect(assertCanonicalReplaceable(name, source)).rejects.toThrow("Invalid skill name");
  }
);

it.each([false, true])(
  "legacy tracked copy preserves auxiliary differences: %s",
  async (changed) => {
    const sourceDirectory = await testEnv.createSkillDir("demo", "original\n");
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "original");
    await fs.writeFile(path.join(sourceDirectory, "reference.md"), "original reference");
    await fs.writeFile(
      path.join(target, "reference.md"),
      changed ? "personal edit" : "original reference"
    );
    const { hashContent } = await import("../../src/lib/skill-store.js");
    await saveIndex({
      version: 1,
      skills: [
        {
          name: "demo",
          source: { type: "local" },
          checksum: hashContent("original"),
          updatedAt: "",
          installs: [
            { scope: "project", agent: "claude", path: target, projectRoot: testEnv.projectDir },
          ],
        },
      ],
    });
    const [result] = await installSkillToTargets("demo", [target], {
      ...(await loadConfig()),
      installMode: "copy",
    });
    expect(result.mode).toBe(changed ? "skipped" : "copy");
    expect(await fs.readFile(path.join(target, "reference.md"), "utf8")).toBe(
      changed ? "personal edit" : "original reference"
    );
  }
);

it("legacy copy does not accept a newline discrepancy with an invalid index checksum", async () => {
  await testEnv.createSkillDir("demo", "original\n");
  const target = path.join(testEnv.agentSkillsDir, "demo");
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "SKILL.md"), "original");
  await saveIndex({
    version: 1,
    skills: [
      {
        name: "demo",
        source: { type: "local" },
        checksum: "wrong",
        updatedAt: "",
        installs: [{ scope: "user", agent: "claude", path: target }],
      },
    ],
  });
  const [result] = await installSkillToTargets("demo", [target], {
    ...(await loadConfig()),
    installMode: "copy",
  });
  expect(result.mode).toBe("skipped");
  expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("original");
});
