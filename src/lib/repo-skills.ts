import fs from "node:fs/promises";
import path from "node:path";
import { fetchText } from "./fetcher.js";
import { buildRawUrl, fetchJson, parseRepoRef, type RepoRef } from "./github.js";
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
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${ref.ref}?recursive=1`;
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
  skillName: string
): Promise<void> {
  const normalizedSkillPath = skillPath.replace(/\/$/, "");
  const files = await listRepoFiles(
    ref,
    {
      name: skillName,
      path: normalizedSkillPath,
      skillFile: normalizeSkillFile(normalizedSkillPath),
    },
    ref.path
  );
  const targetDir = skillDir(skillName);
  await ensureSkillsDir();
  await fs.mkdir(targetDir, { recursive: true });

  for (const file of files) {
    const filePath = ref.path ? `${ref.path}/${file}` : file;
    const content = await fetchRepoFile(ref, filePath);
    const relative = normalizedSkillPath ? file.replace(`${normalizedSkillPath}/`, "") : file;
    const targetPath = path.join(targetDir, relative);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
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
