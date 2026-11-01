import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnv } from "../setup.js";
import { writeRepoSkillDirectory } from "../../src/lib/repo-skills.js";
import { installSkillToTargets } from "../../src/lib/sync.js";
import { writeManagedManifest } from "../../src/lib/managed-manifest.js";
import { saveIndex } from "../../src/lib/index.js";
import { fetchText } from "../../src/lib/fetcher.js";
import { loadConfig } from "../../src/lib/config.js";
import { publishDirectory, recoverDirectory } from "../../src/lib/directory-publish.js";

const sha = "a".repeat(40);
const ref = { owner: "fixture", repo: "skills", ref: "main" };
const markdown = "---\nname: demo\ndescription: Fixture\n---\nTest";
const binary = new Uint8Array([0, 255, 128, 10, 13]);

function mockRepository(
  options: { failAsset?: boolean; truncated?: boolean; unsafe?: boolean } = {}
) {
  const requests: string[] = [];
  vi.stubEnv("GITHUB_TOKEN", "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("/commits/main")) return Response.json({ sha });
      if (url.includes(`/git/trees/${sha}`))
        return Response.json({
          truncated: options.truncated ?? false,
          tree: [
            "demo/SKILL.md",
            options.unsafe ? "demo/../escape" : "demo/assets/nested/image.bin",
          ].map((p) => ({ path: p, type: "blob" })),
        });
      if (url.endsWith("/SKILL.md")) return new Response(markdown);
      if (options.failAsset) return new Response("failure", { status: 503 });
      return new Response(binary);
    })
  );
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("complete repository snapshots", () => {
  it("removes deleted files, preserves binary bytes and uses one immutable commit", async () => {
    const target = await testEnv.createSkillDir("demo", "old");
    await fs.writeFile(path.join(target, "deleted.md"), "old");
    const requests = mockRepository();
    await writeRepoSkillDirectory(ref, "demo", "demo");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(markdown);
    expect(await fs.readFile(path.join(target, "assets/nested/image.bin"))).toEqual(
      Buffer.from(binary)
    );
    expect(await testEnv.fileExists(path.join(target, "deleted.md"))).toBe(false);
    expect(
      requests
        .filter((url) => url.includes("raw.githubusercontent.com"))
        .every((url) => url.includes(`/${sha}/`))
    ).toBe(true);
  });

  it.each([{ failAsset: true }, { truncated: true }, { unsafe: true }])(
    "preserves original on rejected snapshot %j",
    async (options) => {
      const target = await testEnv.createSkillDir("demo", "original");
      mockRepository(options);
      await expect(writeRepoSkillDirectory(ref, "demo", "demo")).rejects.toThrow();
      expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("original");
      expect(await fs.readdir(testEnv.skillsDir)).toEqual(["demo"]);
    }
  );
});

describe("copy synchronization", () => {
  it("copies nested binary files and removes stale target files", async () => {
    const source = await testEnv.createSkillDir("demo", markdown);
    await fs.mkdir(path.join(source, "assets/nested"), { recursive: true });
    await fs.writeFile(path.join(source, "assets/nested/image.bin"), binary);
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "stale.md"), "stale");
    await writeManagedManifest(target);
    await saveIndex({
      version: 1,
      skills: [
        {
          name: "demo",
          source: { type: "local" },
          checksum: "",
          updatedAt: "",
          installs: [{ scope: "user", agent: "claude", path: target }],
        },
      ],
    });
    expect(
      await installSkillToTargets("demo", [target], {
        ...(await loadConfig()),
        installMode: "copy",
      })
    ).toEqual([{ path: target, mode: "copy" }]);
    expect(await fs.readFile(path.join(target, "assets/nested/image.bin"))).toEqual(
      Buffer.from(binary)
    );
    expect(await testEnv.fileExists(path.join(target, "stale.md"))).toBe(false);
  });

  it("reports failed targets and keeps previous contents", async () => {
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "original");
    const results = await installSkillToTargets("missing", [target], {
      ...(await loadConfig()),
      installMode: "copy",
    });
    expect(results[0].mode).toBe("skipped");
    expect(results[0].error).toBeTruthy();
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("original");
  });

  it("rolls back when publication rename fails", async () => {
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "original");
    await expect(
      publishDirectory(path.join(testEnv.agentSkillsDir, "missing-stage"), target)
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("original");
    expect(await fs.readdir(testEnv.agentSkillsDir)).toEqual(["demo"]);
  });
});

it("recovers an interrupted publication from its journal", async () => {
  const target = path.join(testEnv.agentSkillsDir, "demo");
  const backupName = ".demo.backup-12345678-1234-1234-1234-123456789abc";
  const backup = path.join(testEnv.agentSkillsDir, backupName);
  await fs.mkdir(backup);
  await fs.writeFile(path.join(backup, "SKILL.md"), "original");
  const journal = path.join(testEnv.agentSkillsDir, ".demo.publish.json");
  await fs.writeFile(journal, JSON.stringify({ backup: backupName }));
  await recoverDirectory(target);
  expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("original");
  expect(await testEnv.fileExists(journal)).toBe(false);
});

it("finishes cleanup after an interrupted successful publication", async () => {
  const target = path.join(testEnv.agentSkillsDir, "demo");
  const backupName = ".demo.backup-12345678-1234-1234-1234-123456789abc";
  await fs.mkdir(path.join(testEnv.agentSkillsDir, backupName));
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "SKILL.md"), "new");
  const journal = path.join(testEnv.agentSkillsDir, ".demo.publish.json");
  await fs.writeFile(journal, JSON.stringify({ backup: backupName }));
  await recoverDirectory(target);
  expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("new");
  expect(await fs.readdir(testEnv.agentSkillsDir)).toEqual(["demo"]);
});

describe("bounded source redirects", () => {
  it("follows public relative redirects", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/new" } }))
      .mockResolvedValueOnce(new Response("redirected skill"));
    vi.stubGlobal("fetch", mockFetch);
    expect(await fetchText("https://public.example/old")).toBe("redirected skill");
    expect(mockFetch.mock.calls[1][0]).toBe("https://public.example/new");
    expect(mockFetch.mock.calls[1][1].headers).toEqual({});
  });

  it("does not forward GitHub credentials across origins or restore them later", async () => {
    vi.stubEnv("GITHUB_TOKEN", "fixture-token");
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://public.example/asset" } })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://api.github.com/returned" },
        })
      )
      .mockResolvedValueOnce(new Response("safe"));
    vi.stubGlobal("fetch", mockFetch);
    expect(await fetchText("https://api.github.com/start")).toBe("safe");
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fixture-token");
    expect(mockFetch.mock.calls[1][1].headers).toEqual({});
    expect(mockFetch.mock.calls[2][1].headers).toEqual({});
  });

  it("bounds redirect loops", async () => {
    const mockFetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "/loop" } })
    );
    vi.stubGlobal("fetch", mockFetch);
    await expect(fetchText("https://public.example/loop")).rejects.toThrow(
      "maximum of five redirects"
    );
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});
