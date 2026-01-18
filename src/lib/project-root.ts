import path from "node:path";
import fs from "node:fs/promises";

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const findProjectRoot = async (startDir: string): Promise<string> => {
  let current = path.resolve(startDir);
  while (true) {
    const gitDir = path.join(current, ".git");
    if (await exists(gitDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
};
