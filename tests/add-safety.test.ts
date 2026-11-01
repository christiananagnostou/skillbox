import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, assertJsonResponse } from "./helpers/cli.js";
import { testEnv } from "./setup.js";

let server: http.Server;
let url: string;
let markdown: string;
const name = "safe-add";
beforeEach(async () => {
  markdown = "---\nname: safe-add\ndescription: Test skill\n---\nOriginal\n";
  server = http.createServer((_request, response) => response.end(markdown));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  url = `http://127.0.0.1:${address.port}/SKILL.md`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
const add = () => runCli(["add", url, "--name", name, "--global", "--agents", "claude", "--json"]);

describe("safe URL re-add", () => {
  it("preserves edited canonical bytes", async () => {
    assertJsonResponse(await add(), { ok: true, command: "add" });
    const target = path.join(testEnv.skillsDir, name, "SKILL.md");
    await fs.writeFile(target, "local changes");
    const result = await add();
    expect(result.exitCode).toBe(1);
    assertJsonResponse(result, { ok: false, command: "add" });
    expect(await fs.readFile(target, "utf8")).toBe("local changes");
  });
  it("does not update shared canonical content through add", async () => {
    assertJsonResponse(await add(), { ok: true, command: "add" });
    const original = markdown;
    markdown += "Upstream changed\n";
    const result = await add();
    expect(result.exitCode).toBe(1);
    assertJsonResponse(result, { ok: false, command: "add" });
    expect(await fs.readFile(path.join(testEnv.skillsDir, name, "SKILL.md"), "utf8")).toBe(
      original
    );
  });
  it("restores missing canonical bytes instead of reporting a dangling install", async () => {
    assertJsonResponse(await add(), { ok: true, command: "add" });
    await fs.rm(path.join(testEnv.skillsDir, name), { recursive: true });
    assertJsonResponse(await add(), { ok: true, command: "add" });
    expect(await fs.readFile(path.join(testEnv.agentSkillsDir, name, "SKILL.md"), "utf8")).toBe(
      markdown
    );
  });
  it("preserves unowned copy targets and returns clean failure JSON without claiming ownership", async () => {
    const configured = await runCli(["config", "set", "--install-mode", "copy", "--json"]);
    expect(configured.exitCode).toBe(0);
    const target = path.join(testEnv.agentSkillsDir, name);
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "private.txt"), "preserve me");
    const result = await add();
    expect(result.exitCode).toBe(1);
    assertJsonResponse(result, { ok: false, command: "add" });
    expect(await fs.readFile(path.join(target, "private.txt"), "utf8")).toBe("preserve me");
    const index = JSON.parse(await fs.readFile(path.join(testEnv.configDir, "index.json"), "utf8"));
    expect(index.skills[0].installs).toEqual([]);
  });
  it("rejects traversal names before creating files", async () => {
    const result = await runCli(["add", url, "--name", "../escape", "--json"]);
    expect(result.exitCode).toBe(1);
    assertJsonResponse(result, { ok: false, command: "add" });
    expect(await testEnv.fileExists(path.join(testEnv.configDir, "escape"))).toBe(false);
  });
});
