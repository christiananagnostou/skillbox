import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "./atomic-json.js";
import { createHash } from "node:crypto";

const manifestName = ".skillbox-manifest.json";
type Manifest = Record<string, string>;

async function snapshot(directory: string, relative = ""): Promise<Manifest> {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const result: Manifest = Object.create(null);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!relative && [manifestName, "skill.json"].includes(entry.name)) continue;
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await snapshot(directory, name));
    else if (entry.isFile())
      result[name] = createHash("sha256")
        .update(await fs.readFile(path.join(directory, name)))
        .digest("hex");
    else throw new Error(`Unsupported filesystem entry in managed skill: ${name}`);
  }
  return result;
}

export async function writeManagedManifest(directory: string): Promise<void> {
  await setManagedManifest(directory, await snapshot(directory));
}

export async function setManagedManifest(directory: string, manifest: Manifest): Promise<void> {
  validateManifest(manifest);
  await writeJsonAtomic(path.join(directory, manifestName), manifest);
}

function validateManifest(value: unknown): asserts value is Manifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid managed skill manifest.");
  for (const [name, checksum] of Object.entries(value)) {
    if (
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.split("/").some((part) => !part || part === "." || part === "..") ||
      [manifestName, "skill.json"].includes(name) ||
      typeof checksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(checksum)
    ) {
      throw new Error("Invalid managed skill manifest entry.");
    }
  }
}

export async function readManagedManifest(directory: string): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(directory, manifestName), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const baseline: unknown = JSON.parse(raw);
  validateManifest(baseline);
  return baseline;
}

export async function compareManagedManifest(
  directory: string,
  baseline: Manifest
): Promise<string[]> {
  validateManifest(baseline);
  const current = await snapshot(directory);
  return [...new Set([...Object.keys(baseline), ...Object.keys(current)])]
    .filter((name) => baseline[name] !== current[name])
    .sort();
}

export async function hasManagedEdits(directory: string): Promise<boolean | null> {
  const baseline = await readManagedManifest(directory);
  return baseline ? (await compareManagedManifest(directory, baseline)).length > 0 : null;
}
