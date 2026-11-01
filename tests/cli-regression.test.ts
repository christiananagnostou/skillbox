import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execa } from "execa";

const repo = path.resolve(import.meta.dirname, "..");
let root: string;
let baseUrl: string;
let server: http.Server;
let content = "";
let status = 200;
let packedCli: string;
const markdown = (version: string): string =>
  `---\nname: regression\ndescription: Deterministic CLI regression\n---\n${version}\n`;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-cli-regression-"));
  server = http.createServer((_request, response) => {
    response.writeHead(status, { "content-type": "text/plain" });
    response.end(content);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture server address");
  baseUrl = `http://127.0.0.1:${address.port}/SKILL.md`;
  const packed = await execa(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
    {
      cwd: repo,
      env: { npm_config_cache: path.join(root, "npm-cache") },
    }
  );
  const [{ filename, files }] = JSON.parse(packed.stdout) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
  expect(files.some((file) => file.path === "dist/cli.js")).toBe(true);
  expect(files.some((file) => /^(src|tests)\//.test(file.path))).toBe(false);
  await execa("tar", ["-xzf", path.join(root, filename), "-C", root]);
  // Reuse already-installed runtime dependencies; no network, lifecycle scripts, or global link.
  await fs.symlink(
    path.join(repo, "node_modules"),
    path.join(root, "package/node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
  packedCli = path.join(root, "package/dist/cli.js");
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (root) await fs.rm(root, { recursive: true, force: true });
});

for (const artifact of ["built", "packed"] as const) {
  describe(`${artifact} CLI offline contracts`, () => {
    it("releases the mutation lock after help, version and parser errors", async () => {
      const home = await fs.mkdtemp(path.join(root, `${artifact}-help-`));
      const cli = artifact === "built" ? path.join(repo, "dist/cli.js") : packedCli;
      const invoke = (args: string[]) =>
        execa(process.execPath, [cli, ...args], {
          cwd: home,
          extendEnv: false,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            XDG_CONFIG_HOME: path.join(home, ".config"),
            NO_COLOR: "1",
          },
          reject: false,
          timeout: 10000,
        });
      for (const command of [
        "add",
        "agent",
        "config",
        "convert",
        "disable",
        "enable",
        "import",
        "list",
        "meta",
        "project",
        "remove",
        "show",
        "status",
        "update",
        "auto-update",
      ]) {
        const help = await invoke([command, "--help"]);
        expect(help.exitCode, help.stderr).toBe(0);
        expect(help.stdout).toContain("Usage:");
      }
      const version = await invoke(["--version"]);
      expect(version.exitCode).toBe(0);
      expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/);
      for (const args of [["unknown-command"], ["add"], ["list", "--invalid-flag"]]) {
        const failed = await invoke(args);
        expect(failed.exitCode).not.toBe(0);
        const next = await invoke(["list", "--json"]);
        expect(next.exitCode, next.stderr + next.stdout).toBe(0);
        expect(JSON.parse(next.stdout)).toMatchObject({ ok: true, command: "list" });
      }
    });
    for (const mode of ["symlink", "copy"] as const) {
      it(`completes URL lifecycle in ${mode} mode and preserves disabled state`, async () => {
        const home = await fs.mkdtemp(path.join(root, `${artifact}-${mode}-`));
        const cli = artifact === "built" ? path.join(repo, "dist/cli.js") : packedCli;
        const invoke = (args: string[]) =>
          execa(process.execPath, [cli, ...args, "--json"], {
            cwd: home,
            extendEnv: false,
            env: {
              PATH: process.env.PATH,
              HOME: home,
              USERPROFILE: home,
              XDG_CONFIG_HOME: path.join(home, ".config"),
              GH_TOKEN: "fixture-not-a-real-token",
              GITHUB_TOKEN: "fixture-not-a-real-token",
              NO_COLOR: "1",
            },
            reject: false,
            timeout: 10000,
          });
        const success = async (args: string[], command = args[0]) => {
          const result = await invoke(args);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const data = JSON.parse(result.stdout);
          expect(data).toMatchObject({ ok: true, command });
          return data;
        };
        content = markdown("version one");
        status = 200;
        await success(
          ["config", "set", "--install-mode", mode, "--default-agent", "claude"],
          "config set"
        );
        await success(["add", baseUrl, "--name", "regression", "--global", "--agents", "claude"]);
        const canonical = path.join(home, ".config/skillbox/skills/regression/SKILL.md");
        const target = path.join(home, ".claude/skills/regression");
        expect((await fs.readFile(canonical, "utf8")).trim()).toBe(content.trim());
        expect((await fs.lstat(target)).isSymbolicLink()).toBe(mode === "symlink");
        await success(["show", "regression"]);
        await success(["list"]);
        content = markdown("version two");
        const update = await success(["update", "regression"]);
        expect(update.data.results).toContainEqual(
          expect.objectContaining({ name: "regression", status: "updated" })
        );
        expect((await fs.readFile(path.join(target, "SKILL.md"), "utf8")).trim()).toBe(
          content.trim()
        );
        await success(["disable", "regression"]);
        await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
        content = markdown("version three");
        await success(["update", "regression"]);
        await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
        await success(["enable", "regression"]);
        expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toContain("version");
        const previous = await fs.readFile(canonical, "utf8");
        status = 503;
        const failed = await invoke(["update", "regression"]);
        expect(failed.exitCode).not.toBe(0);
        expect(JSON.parse(failed.stdout)).toMatchObject({
          ok: false,
          command: "update",
          data: { failed: 1 },
        });
        expect(await fs.readFile(canonical, "utf8")).toBe(previous);
        await success(["remove", "regression"]);
        await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.lstat(canonical)).rejects.toMatchObject({ code: "ENOENT" });
        const missing = await invoke(["show", "regression"]);
        expect(missing.exitCode).not.toBe(0);
        expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, command: "show" });
      });
    }
  });
}
