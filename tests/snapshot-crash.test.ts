import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recoverDirectory } from "../src/lib/directory-publish.js";

let home: string;
beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-crash-"));
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});
const moduleUrl = (name: string) => pathToFileURL(path.resolve(`dist/lib/${name}.js`)).href;

async function child(
  script: string
): Promise<{ code: number | null; signal: string | null; stderr: string }> {
  const process = spawn(globalThis.process.execPath, ["--input-type=module", "-e", script], {
    env: { ...globalThis.process.env, HOME: home, USERPROFILE: home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  process.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code, signal] = await once(process, "exit");
  return { code, signal, stderr };
}

describe.skipIf(process.platform !== "linux")("killed-process recovery", () => {
  it("reclaims a killed same-namespace owner and rejects concurrent reclaimers safely", async () => {
    const lockModule = JSON.stringify(moduleUrl("mutation-lock"));
    const killed = await child(
      `import { withMutationLock } from ${lockModule}; await withMutationLock(async () => { process.kill(process.pid, "SIGKILL"); });`
    );
    expect(killed.signal).toBe("SIGKILL");
    const failures = path.join(home, "failures");
    await fs.mkdir(failures);
    const attempt = `
      import fs from "node:fs/promises";
      import { withMutationLock } from ${lockModule};
      try {
        await withMutationLock(async () => {
          const deadline = Date.now() + 5000;
          while ((await fs.readdir(${JSON.stringify(failures)})).length < 2) {
            if (Date.now() > deadline) throw new Error("contenders did not finish");
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        });
      } catch {
        await fs.writeFile(${JSON.stringify(failures)} + "/" + process.pid, "failed");
        process.exitCode = 3;
      }
    `;
    const results = await Promise.all([child(attempt), child(attempt), child(attempt)]);
    expect(results.filter((result) => result.code === 0)).toHaveLength(1);
    expect(results.filter((result) => result.code === 3)).toHaveLength(2);
    await expect(
      fs.access(path.join(home, ".config", "skillbox", "mutation.lock"))
    ).rejects.toThrow();
  });

  for (const boundary of ["before-backup", "after-backup", "after-publish"] as const) {
    it(`recovers a publication killed ${boundary}`, async () => {
      const target = path.join(home, "skill");
      const staging = path.join(home, "staging");
      await fs.mkdir(target);
      await fs.mkdir(staging);
      await fs.writeFile(path.join(target, "value"), "old");
      await fs.writeFile(path.join(staging, "value"), "new");
      const result = await child(`
        import fs from "node:fs/promises";
        import { publishDirectory } from ${JSON.stringify(moduleUrl("directory-publish"))};
        const rename = fs.rename.bind(fs);
        fs.rename = async (from, to) => {
          if (${JSON.stringify(boundary)} === "before-backup" && from === ${JSON.stringify(target)}) process.kill(process.pid, "SIGKILL");
          await rename(from, to);
          if (${JSON.stringify(boundary)} === "after-backup" && from === ${JSON.stringify(target)}) process.kill(process.pid, "SIGKILL");
          if (${JSON.stringify(boundary)} === "after-publish" && from === ${JSON.stringify(staging)}) process.kill(process.pid, "SIGKILL");
        };
        await publishDirectory(${JSON.stringify(staging)}, ${JSON.stringify(target)});
      `);
      expect(result.signal, result.stderr).toBe("SIGKILL");
      await recoverDirectory(target);
      await recoverDirectory(target);
      expect(await fs.readFile(path.join(target, "value"), "utf8")).toBe(
        boundary === "after-publish" ? "new" : "old"
      );
      expect(
        (await fs.readdir(home)).some(
          (name) => name.includes("backup-") || name.includes("publish.json")
        )
      ).toBe(false);
    });
  }
});
