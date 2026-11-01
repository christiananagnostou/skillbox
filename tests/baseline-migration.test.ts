import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv } from "./setup.js";
import { saveIndex, loadIndex } from "../src/lib/index.js";
import { hashContent } from "../src/lib/skill-store.js";
import {
  hasManagedEdits,
  readManagedManifest,
  writeManagedManifest,
} from "../src/lib/managed-manifest.js";
import { migrateBaselines } from "../src/lib/baseline-migration.js";
import {
  fetchRepoManifest,
  normalizeRepoRef,
  resolveRepoSnapshot,
} from "../src/lib/repo-skills.js";
import { fetchText } from "../src/lib/fetcher.js";
vi.mock("../src/lib/repo-skills.js", () => ({
  fetchRepoManifest: vi.fn(),
  normalizeRepoRef: vi.fn(),
  resolveRepoSnapshot: vi.fn(),
}));
vi.mock("../src/lib/fetcher.js", () => ({ fetchText: vi.fn() }));
const markdown = "---\nname: demo\ndescription: fixture\n---\nhello";
const remote = { "SKILL.md": hashContent(markdown), "asset.bin": hashContent("binary") };
const sha = "a".repeat(40);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(normalizeRepoRef).mockImplementation(async (ref) => ref);
  vi.mocked(resolveRepoSnapshot).mockImplementation(async (ref) => ({ ...ref, ref: sha }));
  vi.mocked(fetchRepoManifest).mockResolvedValue(remote);
  vi.mocked(fetchText).mockResolvedValue(markdown);
});
async function seed(disabled = false): Promise<string> {
  const directory = path.join(testEnv.skillsDir, "demo");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "SKILL.md"), markdown);
  await fs.writeFile(path.join(directory, "asset.bin"), "binary");
  await saveIndex({
    version: 1,
    skills: [
      {
        name: "demo",
        source: { type: "git", repo: "owner/repo", ref: "main", path: "skills/demo" },
        checksum: hashContent(markdown),
        updatedAt: "old",
        disabled,
        installs: [
          { scope: "user", agent: "claude", path: path.join(testEnv.agentSkillsDir, "demo") },
        ],
      },
    ],
  });
  return directory;
}
describe("safe legacy baseline migration", () => {
  it("records exact immutable upstream match without changing content or index", async () => {
    const directory = await seed();
    const before = await loadIndex();
    const result = await migrateBaselines();
    expect(result[0].status).toBe("migrated");
    expect(result[0].snapshot).toBe(sha);
    expect(fetchRepoManifest).toHaveBeenCalledWith(
      expect.objectContaining({ ref: sha }),
      "skills/demo"
    );
    expect(await hasManagedEdits(directory)).toBe(false);
    expect(await loadIndex()).toEqual(before);
    expect(await fs.readFile(path.join(directory, "asset.bin"), "utf8")).toBe("binary");
  });
  it("preserves added, deleted and binary modified files as protected differences", async () => {
    const directory = await seed();
    await fs.unlink(path.join(directory, "SKILL.md"));
    await fs.writeFile(path.join(directory, "asset.bin"), Buffer.from([0, 255]));
    await fs.writeFile(path.join(directory, "local.sh"), "exit 99");
    const result = await migrateBaselines();
    const location = result[0].locations?.find((entry) => entry.status === "modified");
    expect(location?.differences).toEqual(["SKILL.md", "asset.bin", "local.sh"]);
    expect(await hasManagedEdits(directory)).toBe(true);
    expect(await fs.readFile(path.join(directory, "asset.bin"))).toEqual(Buffer.from([0, 255]));
    expect(await fs.readFile(path.join(directory, "local.sh"), "utf8")).toBe("exit 99");
    await expect(fs.stat(path.join(directory, "SKILL.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("protects copied targets independently and deduplicates shared symlinks", async () => {
    const directory = await seed();
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.cp(directory, target, { recursive: true });
    await fs.writeFile(path.join(target, "asset.bin"), "local copy edit");
    const link = path.join(testEnv.projectDir, "demo");
    await fs.symlink(directory, link);
    const index = await loadIndex();
    index.skills[0].installs!.push({
      scope: "project",
      agent: "codex",
      projectRoot: testEnv.projectDir,
      path: link,
    });
    await saveIndex(index);
    const result = await migrateBaselines();
    expect(result[0].locations).toHaveLength(2);
    expect(await hasManagedEdits(directory)).toBe(false);
    expect(await hasManagedEdits(target)).toBe(true);
    expect(await fs.readFile(path.join(target, "asset.bin"), "utf8")).toBe("local copy edit");
  });
  it("does not recreate missing disabled targets", async () => {
    await seed(true);
    const result = await migrateBaselines();
    expect(result[0].locations).toContainEqual({
      path: path.join(testEnv.agentSkillsDir, "demo"),
      status: "missing",
    });
    await expect(fs.stat(path.join(testEnv.agentSkillsDir, "demo"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await loadIndex()).skills[0].disabled).toBe(true);
  });
  it("preserves everything on unavailable upstream", async () => {
    const directory = await seed();
    vi.mocked(fetchRepoManifest).mockRejectedValue(new Error("repository missing"));
    expect((await migrateBaselines())[0].status).toBe("failed");
    expect(await readManagedManifest(directory)).toBeNull();
    expect(await fs.readFile(path.join(directory, "SKILL.md"), "utf8")).toBe(markdown);
  });
  it("dry run compares without writing and existing baselines are never re-blessed", async () => {
    const directory = await seed();
    expect((await migrateBaselines({ dryRun: true }))[0].status).toBe("migrated");
    expect(await readManagedManifest(directory)).toBeNull();
    await writeManagedManifest(directory);
    await fs.writeFile(path.join(directory, "asset.bin"), "custom");
    const existing = await readManagedManifest(directory);
    expect((await migrateBaselines())[0].status).toBe("skipped");
    expect(await readManagedManifest(directory)).toEqual(existing);
    expect(await hasManagedEdits(directory)).toBe(true);
  });
  it("accepts only the known legacy URL newline transformation", async () => {
    const directory = await seed();
    await fs.unlink(path.join(directory, "asset.bin"));
    await fs.writeFile(path.join(directory, "SKILL.md"), markdown + "\n");
    const index = await loadIndex();
    index.skills[0].source = { type: "url", url: "https://example.test/skill.md" };
    await saveIndex(index);
    expect((await migrateBaselines())[0].status).toBe("migrated");
    expect(await hasManagedEdits(directory)).toBe(false);
  });
  it("rejects malformed manifests and traversal entries", async () => {
    const directory = await seed();
    await fs.writeFile(
      path.join(directory, ".skillbox-manifest.json"),
      JSON.stringify({ "../outside": "a".repeat(64) })
    );
    expect((await migrateBaselines())[0].status).toBe("failed");
    expect(fetchRepoManifest).not.toHaveBeenCalled();
  });
});
