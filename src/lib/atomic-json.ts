import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
