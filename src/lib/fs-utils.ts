import fs from "node:fs/promises";

export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Commander option collector for repeatable options.
 * Used as a callback for options like --category, --tag, etc.
 */
export function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}
