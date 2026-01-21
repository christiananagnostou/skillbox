import path from "node:path";
import { exists } from "./fs-utils.js";

export async function findProjectRoot(startDir: string): Promise<string> {
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
}
