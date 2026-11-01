import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSkillStatus } from "../../src/commands/status.js";
import { writeManagedManifest } from "../../src/lib/managed-manifest.js";
import { testEnv } from "../setup.js";

const sha = "b".repeat(40);
const markdown = "---\nname: demo\ndescription: Fixture\n---\nUnchanged";
const oldAsset = Buffer.from([0, 255, 10]);
const skill = {
  name: "demo",
  source: { type: "git" as const, repo: "fixture/skills", ref: "tracking", path: "skills/demo" },
  checksum: createHash("sha256").update(markdown).digest("hex"),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function baseline(): Promise<void> {
  const directory = await testEnv.createSkillDir("demo", markdown);
  await fs.mkdir(path.join(directory, "assets"));
  await fs.writeFile(path.join(directory, "assets/data.bin"), oldAsset);
  await writeManagedManifest(directory);
}

function remote(
  files: Record<string, string | Buffer>,
  options: { truncated?: boolean; failAsset?: boolean } = {}
): string[] {
  const requests: string[] = [];
  vi.stubEnv("GITHUB_TOKEN", "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("/commits/tracking")) return Response.json({ sha });
      if (url.includes("/git/trees/"))
        return Response.json({
          truncated: options.truncated ?? false,
          tree: Object.keys(files).map((name) => ({ path: `skills/demo/${name}`, type: "blob" })),
        });
      if (!url.includes(`/${sha}/skills/demo/`)) throw new Error("Unpinned content request");
      const name = url.split(`/${sha}/skills/demo/`)[1];
      if (options.failAsset && name !== "SKILL.md") return new Response("offline", { status: 503 });
      return new Response(files[name]);
    })
  );
  return requests;
}

describe("Git full-tree status", () => {
  it.each([
    {
      label: "changed binary",
      files: { "SKILL.md": markdown, "assets/data.bin": Buffer.from([0, 254, 10]) },
    },
    { label: "deleted asset", files: { "SKILL.md": markdown } },
    {
      label: "added reference",
      files: { "SKILL.md": markdown, "assets/data.bin": oldAsset, "references/new.md": "new" },
    },
  ])("detects $label with unchanged SKILL.md", async ({ files }) => {
    await baseline();
    const requests = remote(files);
    const before = await fs.readFile(
      path.join(testEnv.skillsDir, "demo/.skillbox-manifest.json"),
      "utf8"
    );
    const result = await checkSkillStatus(skill);
    expect(result.outdated).toBe(true);
    expect(result.remoteChecksum).toBe(skill.checksum);
    expect(result.checkedContent).toBe("managed-tree");
    expect(result.error).toBeUndefined();
    expect(skill.source.ref).toBe("tracking");
    expect(requests.filter((url) => url.includes("/commits/")).length).toBe(1);
    expect(
      await fs.readFile(path.join(testEnv.skillsDir, "demo/.skillbox-manifest.json"), "utf8")
    ).toBe(before);
  });

  it("reports unchanged complete tree as current", async () => {
    await baseline();
    remote({
      "SKILL.md": markdown,
      "assets/data.bin": oldAsset,
      "skill.json": "untrusted metadata",
    });
    const result = await checkSkillStatus(skill);
    expect(result.outdated).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("reports legacy baseline absence as unknown without claiming current", async () => {
    await testEnv.createSkillDir("demo", markdown);
    const requests = remote({ "SKILL.md": markdown });
    const result = await checkSkillStatus(skill);
    expect(result.error).toContain("Unknown full-tree status");
    expect(requests).toEqual([]);
  });

  it.each([{ truncated: true }, { failAsset: true }])(
    "reports incomplete remote comparison as error: %j",
    async (options) => {
      await baseline();
      remote({ "SKILL.md": markdown, "assets/data.bin": oldAsset }, options);
      const result = await checkSkillStatus(skill);
      expect(result.error).toBeTruthy();
      expect(result.outdated).toBe(false);
    }
  );
});

it("does not call a migrated but locally different skill current", async () => {
  await baseline();
  await fs.writeFile(path.join(testEnv.skillsDir, "demo/assets/data.bin"), "local edit");
  const requests = remote({ "SKILL.md": markdown, "assets/data.bin": oldAsset });
  const result = await checkSkillStatus(skill);
  expect(result.error).toContain("Local files differ");
  expect(requests).toEqual([]);
});
