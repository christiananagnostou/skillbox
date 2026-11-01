import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchBytes, fetchText } from "./fetcher.js";
import { buildRawUrl, fetchJson, parseRepoRef, type RepoRef } from "./github.js";
import type { SkillMetadata } from "./types.js";
import { writeManagedManifest } from "./managed-manifest.js";
import { publishDirectory } from "./directory-publish.js";
import { ensureSkillsDir, skillDir } from "./skill-store.js";

export type RepoSkill = {
  name: string;
  path: string;
  skillFile: string;
};

type TreeEntry = {
  path: string;
  type: "blob" | "tree";
};

type TreeResponse = {
  tree: TreeEntry[];
  truncated?: boolean;
};

const SKILL_ROOTS = [
  "skills",
  "skill",
  ".skills",
  ".skill",
  "agents/skills",
  ".claude/skills",
  ".codex/skills",
  ".cursor/skills",
  ".opencode/skills",
];

function buildTreeUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(ref.ref)}?recursive=1`;
}

function normalizeSkillPath(filePath: string, basePath?: string): RepoSkill | null {
  if (!filePath.endsWith("/SKILL.md") && filePath !== "SKILL.md") {
    return null;
  }
  const normalized = basePath ? filePath.replace(`${basePath}/`, "") : filePath;
  const segments = normalized.split("/");
  if (segments.length === 1) {
    const name = basePath ? (basePath.split("/").filter(Boolean).pop() ?? "root") : "root";
    return { name, path: "", skillFile: normalized };
  }
  return {
    name: segments[segments.length - 2],
    path: segments.slice(0, -1).join("/"),
    skillFile: normalized,
  };
}

function normalizeSkillFile(skillPath: string): string {
  return skillPath ? `${skillPath}/SKILL.md` : "SKILL.md";
}

function filterSkills(entries: TreeEntry[], basePath?: string, includeAll = false): RepoSkill[] {
  const skills: RepoSkill[] = [];

  for (const entry of entries) {
    if (entry.type !== "blob") {
      continue;
    }
    if (
      basePath &&
      !entry.path.startsWith(`${basePath}/`) &&
      entry.path !== `${basePath}/SKILL.md`
    ) {
      continue;
    }

    const skill = normalizeSkillPath(entry.path, basePath);
    if (skill) {
      skills.push(skill);
    }
  }

  if (basePath || includeAll) {
    return skills;
  }

  return skills.filter((skill) => {
    if (skill.skillFile === "SKILL.md") {
      return true;
    }
    return SKILL_ROOTS.some((root) => skill.path.startsWith(root));
  });
}

export async function listRepoSkills(
  input: string | RepoRef
): Promise<{ ref: RepoRef; skills: RepoSkill[] }> {
  const ref = typeof input === "string" ? parseRepoRef(input) : input;
  if (!ref) {
    throw new Error("Unsupported repo URL or shorthand.");
  }
  const normalized = await normalizeRepoRef(ref);

  const tree = await fetchJson<TreeResponse>(buildTreeUrl(normalized));
  if (tree.truncated)
    throw new Error("Repository tree is truncated; refusing incomplete skill discovery.");
  const includeAll = normalized.repo.toLowerCase() === "skills" && !normalized.path;
  const skills = filterSkills(tree.tree, normalized.path, includeAll);

  if (skills.length === 0) {
    throw new Error("No skills found in repository.");
  }

  return { ref: normalized, skills };
}

export async function listRepoFiles(
  ref: RepoRef,
  skill: RepoSkill,
  basePath?: string
): Promise<string[]> {
  const tree = await fetchJson<TreeResponse>(buildTreeUrl(ref));
  if (tree.truncated)
    throw new Error("Repository tree is truncated; refusing incomplete skill update.");
  const prefix = basePath ? [basePath, skill.path].filter(Boolean).join("/") : skill.path;
  const files = tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter((filePath) => !prefix || filePath.startsWith(`${prefix}/`))
    .map((filePath) => (basePath ? filePath.replace(`${basePath}/`, "") : filePath));

  return files.length > 0 ? files : [skill.skillFile];
}

export async function fetchRepoFile(ref: RepoRef, filePath: string): Promise<string> {
  return fetchText(buildRawUrl(ref, filePath));
}

export async function writeRepoSkillDirectory(
  ref: RepoRef,
  skillPath: string,
  skillName: string,
  metadata?: SkillMetadata
): Promise<void> {
  const snapshot = await resolveRepoSnapshot(ref);
  const normalizedSkillPath = skillPath.replace(/\/$/, "");
  const files = await listRepoFiles(
    snapshot,
    {
      name: skillName,
      path: normalizedSkillPath,
      skillFile: normalizeSkillFile(normalizedSkillPath),
    },
    ref.path
  );
  const targetDir = skillDir(skillName);
  await ensureSkillsDir();
  const staging = await fs.mkdtemp(path.join(path.dirname(targetDir), ".skillbox-stage-"));
  try {
    for (const file of files) {
      const filePath = ref.path ? `${ref.path}/${file}` : file;
      const relative = normalizedSkillPath ? file.slice(normalizedSkillPath.length + 1) : file;
      // Git paths are untrusted input and must stay inside the staging directory.
      if (
        !relative ||
        relative.split(/[\\/]/).some((part) => part === ".." || part === ".") ||
        path.isAbsolute(relative) ||
        relative.includes("\\")
      ) {
        throw new Error(`Unsafe repository file path: ${file}`);
      }
      if (relative === "skill.json" || relative === ".skillbox-manifest.json") continue;
      const content = await fetchBytes(buildRawUrl(snapshot, filePath));
      const targetPath = path.join(staging, relative);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content);
    }
    await fs.access(path.join(staging, "SKILL.md"));
    if (metadata) {
      await fs.writeFile(
        path.join(staging, "skill.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        "utf8"
      );
    }
    await writeManagedManifest(staging);
    await publishDirectory(staging, targetDir);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export async function normalizeRepoRef(ref: RepoRef): Promise<RepoRef> {
  try {
    await fetchJson<TreeResponse>(buildTreeUrl(ref));
    return ref;
  } catch {
    if (ref.ref === "main") {
      const fallback = { ...ref, ref: "master" };
      await fetchJson<TreeResponse>(buildTreeUrl(fallback));
      return fallback;
    }
    throw new Error("Unable to resolve repository ref.");
  }
}

/** Resolve a tracking branch or tag once so all files come from one commit. */
export async function resolveRepoSnapshot(ref: RepoRef): Promise<RepoRef> {
  if (/^[a-f0-9]{40}$/i.test(ref.ref)) return ref;
  const commit = await fetchJson<{ sha: string }>(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(ref.ref)}`
  );
  if (!/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error("Invalid repository commit response.");
  return { ...ref, ref: commit.sha };
}

/** Read a complete immutable remote tree without writing to the local skill store. */
export async function fetchRepoManifest(
  ref: RepoRef,
  skillPath: string
): Promise<Record<string, string>> {
  const snapshot = await resolveRepoSnapshot(ref);
  const normalizedPath = skillPath.replace(/\/$/, "");
  const files = await listRepoFiles(
    snapshot,
    {
      name: "status",
      path: normalizedPath,
      skillFile: normalizeSkillFile(normalizedPath),
    },
    ref.path
  );
  const manifest: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const file of files) {
    const relative = normalizedPath ? file.slice(normalizedPath.length + 1) : file;
    if (
      !relative ||
      relative.split(/[\\/]/).some((part) => part === ".." || part === ".") ||
      path.isAbsolute(relative) ||
      relative.includes("\\")
    ) {
      throw new Error(`Unsafe repository file path: ${file}`);
    }
    if (relative === "skill.json" || relative === ".skillbox-manifest.json") continue;
    const filePath = ref.path ? `${ref.path}/${file}` : file;
    manifest[relative] = createHash("sha256")
      .update(await fetchBytes(buildRawUrl(snapshot, filePath)))
      .digest("hex");
  }
  if (!manifest["SKILL.md"]) throw new Error("Remote skill is missing SKILL.md.");
  return manifest;
}
