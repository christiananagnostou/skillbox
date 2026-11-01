import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout } from "node:timers/promises";

async function replaceFile(temporary: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temporary, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows readers/virus scanners can briefly prevent replacing an existing file.
      // Keep the old destination intact throughout the bounded retry window.
      if (
        os.platform() !== "win32" ||
        !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") ||
        attempt >= 9
      ) {
        throw error;
      }
      await setTimeout(Math.min(10 * 2 ** attempt, 250));
    }
  }
}

/** Publish a complete JSON document using a same-directory atomic rename. */
export async function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  const document = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`
  );
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(document, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceFile(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
