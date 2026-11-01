// Opt-in registry test: node scripts/verify-clean-package.mjs
// Build first. This deliberately stays outside the deterministic offline test suite.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-clean-package-"));
const home = path.join(root, "home");
const prefix = path.join(root, "prefix");
let server;
const commands = [];
try {
  await fs.mkdir(home);
  // Do not inherit registry tokens, npm config, NODE_OPTIONS or GitHub credentials.
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    NO_COLOR: "1",
    npm_config_cache: path.join(root, "cache"),
    npm_config_fetch_retries: "0",
    npm_config_fetch_timeout: "30000",
    npm_config_update_notifier: "false",
    npm_config_userconfig: path.join(root, "empty.npmrc"),
    npm_config_globalconfig: path.join(root, "empty-global.npmrc"),
  };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  // Preserve required network transport settings, without inheriting application credentials.
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  await fs.writeFile(env.npm_config_userconfig, "");
  await fs.writeFile(env.npm_config_globalconfig, "");
  const run = async (command, args, cwd = home) => {
    const result = await execa(command, args, {
      cwd,
      env,
      extendEnv: false,
      timeout: 120000,
      reject: false,
    });
    commands.push({ command: [command, ...args], exitCode: result.exitCode });
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  const packed = JSON.parse(
    await run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], repository)
  );
  const tarball = path.join(root, packed[0].filename);
  const installOutput = await run("npm", [
    "install",
    "--prefix",
    prefix,
    "--ignore-scripts",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--registry=https://registry.npmjs.org",
    tarball,
  ]);
  const dependencyTree = JSON.parse(
    await run("npm", ["ls", "--prefix", prefix, "--all", "--json"])
  );
  const installed = path.join(prefix, "node_modules", "skillbox");
  assert.equal((await fs.lstat(installed)).isSymbolicLink(), false);
  assert.equal(await fs.realpath(installed), installed);
  const cli = path.join(installed, "dist", "cli.js");
  assert.match(await run(process.execPath, [cli, "--version"]), /^\d+\.\d+\.\d+/);
  const installedBin = path.join(
    prefix,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "skillbox.cmd" : "skillbox"
  );
  assert.match(await run(installedBin, ["--version"]), /^\d+\.\d+\.\d+/);
  const markdown = (version) =>
    `---\nname: clean-package\ndescription: Clean package lifecycle fixture\n---\n${version}\n`;
  let content = markdown("first");
  server = http.createServer((_request, response) => response.end(content));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/SKILL.md`;
  const invoke = async (args, command = args[0]) => {
    const response = JSON.parse(await run(process.execPath, [cli, ...args, "--json"]));
    assert.equal(response.ok, true);
    assert.equal(response.command, command);
    return response;
  };
  await invoke(
    ["config", "set", "--install-mode", "copy", "--default-agent", "claude"],
    "config set"
  );
  await invoke(["add", url, "--global", "--agents", "claude", "--name", "clean-package"]);
  await invoke(["show", "clean-package"]);
  const target = path.join(home, ".claude", "skills", "clean-package", "SKILL.md");
  assert.equal((await fs.readFile(target, "utf8")).trim(), content.trim());
  content = markdown("second");
  const update = await invoke(["update", "clean-package"]);
  assert.equal(update.data.updated, 1);
  assert.equal((await fs.readFile(target, "utf8")).trim(), content.trim());
  await invoke(["disable", "clean-package"]);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
  await invoke(["enable", "clean-package"]);
  assert.equal((await fs.readFile(target, "utf8")).trim(), content.trim());
  await invoke(["remove", "clean-package"]);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
  console.log(
    JSON.stringify(
      {
        ok: true,
        node: process.version,
        platform: process.platform,
        installOutput: installOutput.trim(),
        dependencyTree,
        commands,
      },
      null,
      2
    )
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
