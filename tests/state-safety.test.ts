import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonAtomic } from "../src/lib/atomic-json.js";
import { withMutationLock } from "../src/lib/mutation-lock.js";

let root: string;
vi.mock("../src/lib/paths.js", () => ({ skillboxRoot: () => root }));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-state-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("atomic JSON publication", () => {
  it("publishes only complete documents during concurrent writes", async () => {
    const target = path.join(root, "index.json");
    await writeJsonAtomic(target, { value: "initial" });
    const writes = Array.from({ length: 20 }, (_, i) =>
      writeJsonAtomic(target, { value: String(i).repeat(1000) })
    );
    // Attach handlers immediately and settle every writer before fixture cleanup, even if a read fails.
    const settledWrites = Promise.allSettled(writes);
    let results: PromiseSettledResult<void>[] = [];
    try {
      for (let i = 0; i < 20; i++) {
        expect(JSON.parse(await fs.readFile(target, "utf8"))).toHaveProperty("value");
      }
    } finally {
      results = await settledWrites;
    }
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    expect(await fs.readdir(root)).toEqual(["index.json"]);
  });

  it("preserves the old document if serialization fails", async () => {
    const target = path.join(root, "index.json");
    await writeJsonAtomic(target, { value: "old" });
    await expect(writeJsonAtomic(target, { invalid: 1n })).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ value: "old" });
  });

  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    it(`retries transient Windows ${code} without removing the old destination`, async () => {
      const target = path.join(root, "index.json");
      await writeJsonAtomic(target, { value: "old" });
      vi.spyOn(os, "platform").mockReturnValue("win32");
      const rename = fs.rename.bind(fs);
      let attempts = 0;
      const replacement = vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
        expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ value: "old" });
        if (++attempts <= 2) throw Object.assign(new Error("sharing violation"), { code });
        return rename(source, destination);
      });
      await writeJsonAtomic(target, { value: "new" });
      expect(replacement).toHaveBeenCalledTimes(3);
      expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ value: "new" });
      expect(await fs.readdir(root)).toEqual(["index.json"]);
    });
  }

  it("bounds permanent Windows contention and cleans the temporary file", async () => {
    const target = path.join(root, "index.json");
    await writeJsonAtomic(target, { value: "old" });
    vi.spyOn(os, "platform").mockReturnValue("win32");
    const failure = Object.assign(new Error("destination unavailable"), { code: "EPERM" });
    const replacement = vi.spyOn(fs, "rename").mockRejectedValue(failure);
    await expect(writeJsonAtomic(target, { value: "new" })).rejects.toBe(failure);
    expect(replacement).toHaveBeenCalledTimes(10);
    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ value: "old" });
    expect(await fs.readdir(root)).toEqual(["index.json"]);
  });

  it.each([
    ["linux", "EPERM"],
    ["win32", "ENOSPC"],
  ] as const)("does not retry %s %s failures", async (platform, code) => {
    const target = path.join(root, "index.json");
    await writeJsonAtomic(target, { value: "old" });
    vi.spyOn(os, "platform").mockReturnValue(platform);
    const failure = Object.assign(new Error("permanent failure"), { code });
    const replacement = vi.spyOn(fs, "rename").mockRejectedValue(failure);
    await expect(writeJsonAtomic(target, { value: "new" })).rejects.toBe(failure);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ value: "old" });
    expect(await fs.readdir(root)).toEqual(["index.json"]);
  });
});

describe("mutation lock", () => {
  it("rejects concurrent operations and permits nested operations", async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withMutationLock(async () => {
      await withMutationLock(async () => expect(true).toBe(true));
      started();
      await barrier;
    });
    await ready;
    await expect(withMutationLock(async () => {})).rejects.toThrow("Another Skillbox operation");
    release();
    await first;
    await expect(withMutationLock(async () => 42)).resolves.toBe(42);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("releases the lock on action failure", async () => {
    await expect(
      withMutationLock(async () => {
        throw new Error("failure");
      })
    ).rejects.toThrow("failure");
    await expect(withMutationLock(async () => "recovered")).resolves.toBe("recovered");
  });

  it("never removes an abandoned or unknown lock", async () => {
    const target = path.join(root, "mutation.lock");
    await fs.writeFile(target, "interrupted");
    await expect(withMutationLock(async () => {})).rejects.toThrow("verify no Skillbox process");
    expect(await fs.readFile(target, "utf8")).toBe("interrupted");
  });
});

describe.skipIf(process.platform !== "linux")("conservative dead-owner recovery", () => {
  async function writeOwner(overrides: Record<string, unknown> = {}): Promise<string> {
    const content = JSON.stringify({
      pid: 2147483647,
      token: randomUUID(),
      hostname: os.hostname(),
      bootId: (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(),
      pidNamespace: await fs.readlink("/proc/self/ns/pid"),
      createdAt: new Date().toISOString(),
      ...overrides,
    });
    await fs.writeFile(path.join(root, "mutation.lock"), content);
    return content;
  }
  it("reclaims a provably dead local owner", async () => {
    await writeOwner();
    await expect(withMutationLock(async () => "recovered")).resolves.toBe("recovered");
  });
  for (const overrides of [
    { pid: process.pid },
    { hostname: "foreign-host" },
    { bootId: "foreign-boot" },
    { pidNamespace: "pid:[foreign]" },
    { pidNamespace: null },
    { pid: -1 },
  ]) {
    it(`preserves uncertain/live owner ${JSON.stringify(overrides)}`, async () => {
      const original = await writeOwner(overrides);
      await expect(withMutationLock(async () => {})).rejects.toThrow("Another Skillbox operation");
      expect(await fs.readFile(path.join(root, "mutation.lock"), "utf8")).toBe(original);
    });
  }
  it("never bypasses an abandoned reclaim guard", async () => {
    const original = await writeOwner();
    await fs.mkdir(path.join(root, "mutation.lock.reclaim"));
    await expect(withMutationLock(async () => {})).rejects.toThrow("Another Skillbox operation");
    expect(await fs.readFile(path.join(root, "mutation.lock"), "utf8")).toBe(original);
  });
  it("treats a permission-denied PID probe as uncertain", async () => {
    const original = await writeOwner();
    const probe = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });
    try {
      await expect(withMutationLock(async () => {})).rejects.toThrow("Another Skillbox operation");
      expect(await fs.readFile(path.join(root, "mutation.lock"), "utf8")).toBe(original);
    } finally {
      probe.mockRestore();
    }
  });
});
