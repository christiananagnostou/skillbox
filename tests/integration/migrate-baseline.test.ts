import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testEnv } from "../setup.js";
import { runCliJson } from "../helpers/cli.js";
import { hashContent } from "../../src/lib/skill-store.js";
import { hasManagedEdits } from "../../src/lib/managed-manifest.js";
const markdown = "---\nname: migrate-demo\ndescription: test\n---\ncontent";
let server: http.Server;
let url: string;
beforeAll(async () => {
  server = http.createServer((_request, response) => response.end(markdown));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server port");
  url = `http://127.0.0.1:${address.port}/SKILL.md`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe("migrate-baseline CLI", () => {
  it("reports protected differences and keeps content unchanged through a real CLI migration", async () => {
    const directory = path.join(testEnv.skillsDir, "migrate-demo");
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "SKILL.md"), markdown);
    await fs.writeFile(path.join(directory, "custom.bin"), Buffer.from([0, 255]));
    await fs.writeFile(
      path.join(testEnv.configDir, "index.json"),
      JSON.stringify({
        version: 1,
        skills: [
          {
            name: "migrate-demo",
            source: { type: "url", url },
            checksum: hashContent(markdown),
            updatedAt: "old",
          },
        ],
      })
    );
    const dry = await runCliJson<{ ok: boolean; command: string; data: { dryRun: boolean } }>([
      "migrate-baseline",
      "--dry-run",
    ]);
    expect(dry.result.exitCode).toBe(0);
    expect(dry.data).toMatchObject({
      ok: true,
      command: "migrate-baseline",
      data: { dryRun: true },
    });
    expect(await hasManagedEdits(directory)).toBeNull();
    const run = await runCliJson<{ ok: boolean; data: { results: Array<{ status: string }> } }>([
      "migrate-baseline",
      "migrate-demo",
    ]);
    expect(run.result.exitCode).toBe(0);
    expect(run.data?.data.results[0].status).toBe("migrated");
    expect(await hasManagedEdits(directory)).toBe(true);
    expect(await fs.readFile(path.join(directory, "custom.bin"))).toEqual(Buffer.from([0, 255]));
    const update = await runCliJson<{ data: { results: Array<{ reason: string }> } }>([
      "update",
      "migrate-demo",
    ]);
    expect(update.data?.data.results[0].reason).toBe("locally modified");
  });
  it("returns nonzero structured error for unknown skill", async () => {
    const result = await runCliJson<{ ok: boolean; command: string }>([
      "migrate-baseline",
      "missing",
    ]);
    expect(result.result.exitCode).toBe(1);
    expect(result.data).toMatchObject({ ok: false, command: "migrate-baseline" });
  });
});
