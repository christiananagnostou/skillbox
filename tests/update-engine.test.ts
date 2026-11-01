import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testEnv } from "./setup.js";
import { runUpdates } from "../src/lib/update-engine.js";
import { loadIndex, saveIndex } from "../src/lib/index.js";
import { hashContent } from "../src/lib/skill-store.js";
import { writeManagedManifest } from "../src/lib/managed-manifest.js";
import type { IndexedSkill } from "../src/lib/types.js";

const old = "---\nname: demo\ndescription: old\n---\nold";
const next = "---\nname: demo\ndescription: new\n---\nnew";
let url: string;
let server: http.Server;
let requests = 0;
beforeAll(async () => {
  server = http.createServer((request, response) => {
    requests++;
    if (request.url === "/fail") {
      response.writeHead(503);
      response.end("unavailable");
    } else if (request.url === "/invalid") response.end("invalid");
    else response.end(next);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function seed(overrides: Partial<IndexedSkill> = {}): Promise<string> {
  const directory = path.join(testEnv.skillsDir, "demo");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "SKILL.md"), old + "\n");
  await saveIndex({
    version: 1,
    skills: [
      {
        name: "demo",
        source: { type: "url", url },
        checksum: hashContent(old),
        updatedAt: "old",
        ...overrides,
      },
    ],
  });
  return directory;
}
describe("deterministic update engine", () => {
  it("updates URL content and stores canonical checksum", async () => {
    const directory = await seed();
    expect((await runUpdates()).updated).toBe(1);
    expect(await fs.readFile(path.join(directory, "SKILL.md"), "utf8")).toBe(next);
    expect((await loadIndex()).skills[0].checksum).toBe(hashContent(next));
  });
  it("skips disabled installs without recreating targets or fetching", async () => {
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await seed({ disabled: true, installs: [{ scope: "user", agent: "claude", path: target }] });
    const before = requests;
    expect((await runUpdates()).results[0].reason).toBe("disabled");
    expect(requests).toBe(before);
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("preserves local edits", async () => {
    const directory = await seed();
    await fs.writeFile(path.join(directory, "SKILL.md"), "custom");
    expect((await runUpdates()).results[0].reason).toBe("locally modified");
    expect(await fs.readFile(path.join(directory, "SKILL.md"), "utf8")).toBe("custom");
  });
  it("protects edited auxiliary files with manifests", async () => {
    const directory = await seed();
    await fs.writeFile(path.join(directory, "asset.bin"), Buffer.from([0, 255]));
    await writeManagedManifest(directory);
    await fs.writeFile(path.join(directory, "asset.bin"), Buffer.from([0, 254]));
    expect((await runUpdates()).results[0].reason).toBe("locally modified");
  });
  it("skips legacy Git without a full baseline", async () => {
    await seed({ source: { type: "git", repo: "owner/repo", ref: "main" } });
    expect((await runUpdates()).results[0].reason).toContain("missing managed-file baseline");
  });
  it("dry run and exclusion do not fetch or change index", async () => {
    await seed();
    const before = requests;
    const index = await loadIndex();
    expect((await runUpdates({ dryRun: true })).results[0].reason).toBe("eligible (dry run)");
    expect((await runUpdates({ exclude: ["demo"] })).results[0].reason).toBe("excluded");
    expect(requests).toBe(before);
    expect(await loadIndex()).toEqual(index);
  });
  it("reports invalid sources as failures", async () => {
    await seed({ source: { type: "url" } });
    expect((await runUpdates()).failed).toBe(1);
  });
  it("keeps canonical metadata after target synchronization fails", async () => {
    const target = path.join(testEnv.agentSkillsDir, "blocked");
    await fs.mkdir(target);
    await seed({ installs: [{ scope: "user", agent: "claude", path: target }] });
    const result = await runUpdates();
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("target synchronization failed");
    expect((await loadIndex()).skills[0].checksum).toBe(hashContent(next));
    expect((await loadIndex()).skills[0].lastSync).toBeUndefined();
  });
  it("retries failed legacy copied targets against their captured baseline", async () => {
    const target = path.join(testEnv.agentSkillsDir, "demo");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), old + "\n");
    await seed({ installs: [{ scope: "user", agent: "claude", path: target }] });
    expect((await runUpdates()).failed).toBe(1);
    expect((await loadIndex()).skills[0].pendingSync).toEqual([target]);
    const configPath = path.join(testEnv.configDir, "config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    await fs.writeFile(configPath, JSON.stringify({ ...config, installMode: "copy" }));
    expect((await runUpdates()).updated).toBe(1);
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(next);
    expect((await loadIndex()).skills[0].pendingSync).toEqual([]);
  });
  it("keeps installed content when downloaded metadata is invalid", async () => {
    const directory = await seed({ source: { type: "url", url: `${url}/invalid` } });
    const result = await runUpdates();
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("missing a description");
    expect(await fs.readFile(path.join(directory, "SKILL.md"), "utf8")).toBe(old + "\n");
    expect((await loadIndex()).skills[0].checksum).toBe(hashContent(old));
  });
  it("reconciles index metadata after interrupted canonical publication", async () => {
    const directory = await seed({ source: { type: "url", url: `${url}/invalid` } });
    await fs.writeFile(path.join(directory, "SKILL.md"), next);
    await fs.writeFile(
      path.join(directory, "skill.json"),
      JSON.stringify({ name: "demo", checksum: hashContent(next), updatedAt: "recovered" })
    );
    await writeManagedManifest(directory);
    expect((await runUpdates()).failed).toBe(1);
    expect((await loadIndex()).skills[0].checksum).toBe(hashContent(next));
    expect((await loadIndex()).skills[0].updatedAt).toBe("recovered");
  });
});
