import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { skillboxRoot } from "./paths.js";

const lockContext = new AsyncLocalStorage<Set<string>>();
type Owner = {
  pid: number;
  token: string;
  hostname: string;
  bootId: string | null;
  pidNamespace: string | null;
  createdAt: string;
};

async function bootIdentity(): Promise<string | null> {
  if (process.platform !== "linux") return null;
  return fs
    .readFile("/proc/sys/kernel/random/boot_id", "utf8")
    .then((id) => id.trim())
    .catch(() => null);
}

function deadOwner(content: string, bootId: string | null, pidNamespace: string | null): boolean {
  try {
    const owner = JSON.parse(content) as Owner;
    if (
      !pidNamespace ||
      owner.pidNamespace !== pidNamespace ||
      !bootId ||
      owner.bootId !== bootId ||
      owner.hostname !== os.hostname() ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.token !== "string" ||
      !/^[a-f0-9-]{36}$/.test(owner.token)
    )
      return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH";
    }
  } catch {
    return false;
  }
}

async function reclaimDeadOwner(
  lockPath: string,
  bootId: string | null,
  pidNamespace: string | null
): Promise<void> {
  // Serialize reclaimers, then re-read the record: an earlier reclaimer may have replaced it.
  // An abandoned guard is deliberately never guessed stale.
  const guard = `${lockPath}.reclaim`;
  try {
    await fs.mkdir(guard);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
  try {
    const content = await fs.readFile(lockPath, "utf8").catch(() => "");
    if (deadOwner(content, bootId, pidNamespace)) await fs.unlink(lockPath);
  } finally {
    await fs.rmdir(guard);
  }
}

/** Serialize cooperating mutations. Only provably dead same-boot Linux owners are reclaimed. */
export async function withMutationLock<T>(action: () => Promise<T>): Promise<T> {
  const root = skillboxRoot();
  const held = lockContext.getStore();
  if (held?.has(root)) return action();
  await fs.mkdir(root, { recursive: true });
  const lockPath = path.join(root, "mutation.lock");
  const token = randomUUID();
  const bootId = await bootIdentity();
  const pidNamespace = await fs.readlink("/proc/self/ns/pid").catch(() => null);
  let handle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await reclaimDeadOwner(lockPath, bootId, pidNamespace);
    try {
      handle = await fs.open(lockPath, "wx", 0o600);
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code !== "EEXIST") throw retryError;
      throw new Error(
        `Another Skillbox operation holds ${lockPath}. If a previous operation crashed, verify no Skillbox process is running before removing this lock or its .reclaim guard.`
      );
    }
  }
  try {
    await handle.writeFile(
      JSON.stringify({
        pid: process.pid,
        token,
        hostname: os.hostname(),
        bootId,
        pidNamespace,
        createdAt: new Date().toISOString(),
      } satisfies Owner)
    );
    await handle.sync();
    await handle.close();
    return await lockContext.run(new Set([...(held ?? []), root]), action);
  } finally {
    await handle.close().catch(() => {});
    const owner = await fs.readFile(lockPath, "utf8").catch(() => "");
    try {
      if ((JSON.parse(owner) as { token?: string }).token === token) await fs.unlink(lockPath);
    } catch {
      // A missing or damaged lock needs inspection; do not delete unknown state.
    }
  }
}
