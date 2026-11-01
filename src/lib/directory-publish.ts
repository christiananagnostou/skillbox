import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeJsonAtomic } from "./atomic-json.js";

async function present(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function journalPath(target: string): string {
  return path.join(path.dirname(target), `.${path.basename(target)}.publish.json`);
}

/** Recover a process interrupted between the two directory renames. Requires the mutation lock. */
export async function recoverDirectory(target: string): Promise<void> {
  const journal = journalPath(target);
  let record: { backup: string };
  try {
    record = JSON.parse(await fs.readFile(journal, "utf8")) as { backup: string };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const prefix = `.${path.basename(target)}.backup-`;
  if (
    typeof record.backup !== "string" ||
    !record.backup.startsWith(prefix) ||
    !/^[a-f0-9-]{36}$/.test(record.backup.slice(prefix.length))
  ) {
    throw new Error(`Invalid directory publication journal: ${journal}`);
  }
  const backup = path.join(path.dirname(target), record.backup);
  if (await present(backup)) {
    if (await present(target)) {
      await fs.rm(backup, { recursive: true, force: true });
    } else {
      await fs.rename(backup, target);
    }
  }
  await fs.rm(journal, { force: true });
}

/** Publish a complete sibling staging directory, rolling back failed renames. Requires the mutation lock. */
export async function publishDirectory(staging: string, target: string): Promise<void> {
  await recoverDirectory(target);
  const backup = path.join(
    path.dirname(target),
    `.${path.basename(target)}.backup-${randomUUID()}`
  );
  const journal = journalPath(target);
  await writeJsonAtomic(journal, { backup: path.basename(backup) });
  let hadTarget = false;
  try {
    try {
      await fs.rename(target, backup);
      hadTarget = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(staging, target);
    } catch (error) {
      if (hadTarget) await fs.rename(backup, target);
      throw error;
    }
    if (hadTarget) await fs.rm(backup, { recursive: true, force: true });
    await fs.rm(journal, { force: true });
  } catch (error) {
    // Leave the journal if rollback or cleanup itself failed, so the next run can recover.
    if (!(await present(backup))) await fs.rm(journal, { force: true });
    throw error;
  }
}
