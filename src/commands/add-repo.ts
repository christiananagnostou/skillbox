import { getErrorMessage } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { parseRepoRef, type RepoRef } from "../lib/github.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { recordInstallPaths } from "../lib/installs.js";
import { printInfo, printJson } from "../lib/output.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import {
  fetchRepoFile,
  listRepoSkills,
  normalizeRepoRef,
  writeRepoSkillDirectory,
} from "../lib/repo-skills.js";
import { ensureProjectRegistered, resolveRuntime } from "../lib/runtime.js";
import { buildMetadata, parseSkillMarkdown } from "../lib/skill-parser.js";
import { writeSkillMetadata } from "../lib/skill-store.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "../lib/sync.js";
import type { SkillInstall } from "../lib/types.js";

export type RepoAddOptions = {
  global?: boolean;
  agents?: string;
  json?: boolean;
  list?: boolean;
  skill?: string[];
};

type RepoInstallSummary = {
  installed: string[];
  updated: string[];
  skipped: string[];
  failed: Array<{ name: string; reason: string }>;
};

function normalizeSkillSelection(skills: string[], selections: string[]): string[] {
  if (selections.length === 0) {
    return skills;
  }
  const selectionSet = new Set(selections);
  return skills.filter((name) => selectionSet.has(name));
}

async function ensureRepoRef(input: string): Promise<RepoRef> {
  const ref = parseRepoRef(input);
  if (!ref) {
    throw new Error("Unsupported repo URL or shorthand.");
  }
  return normalizeRepoRef(ref);
}

async function installSkillTargets(
  skillName: string,
  options: RepoAddOptions,
  installs: SkillInstall[]
): Promise<void> {
  const { projectRoot, scope, agentList } = await resolveRuntime({
    global: options.global,
    agents: options.agents,
  });
  const projectEntry = await ensureProjectRegistered(projectRoot, scope);
  const paths = buildProjectAgentPaths(projectRoot, projectEntry);
  const config = await loadConfig();
  const recordedPaths = new Set<string>();

  for (const agent of agentList) {
    const map = paths[agent];
    if (!map) {
      continue;
    }
    const targets = buildTargets(agent, map, scope).map((target) => target.path);
    const results = await installSkillToTargets(skillName, targets, config);
    const written = results
      .filter((result) => result.mode !== "skipped")
      .map((result) => result.path);

    const warnings = buildSymlinkWarning(agent, results);
    for (const warning of warnings) {
      printInfo(warning);
    }

    const deduped = recordInstallPaths(written, recordedPaths);
    if (deduped.length > 0) {
      for (const target of deduped) {
        installs.push({
          scope,
          agent,
          path: target,
          projectRoot: scope === "project" ? projectRoot : undefined,
        });
      }
    }
  }
}

export function isRepoUrl(input: string): boolean {
  return Boolean(parseRepoRef(input));
}

export async function handleRepoInstall(input: string, options: RepoAddOptions): Promise<void> {
  const ref = await ensureRepoRef(input);
  const { skills } = await listRepoSkills(ref);

  const skillNames = skills.map((skill) => skill.name).sort();

  if (options.list) {
    if (options.json) {
      printJson({ ok: true, command: "add", data: { repo: input, skills: skillNames } });
      return;
    }
    printInfo(`Repo Skills: ${ref.owner}/${ref.repo}`);
    printInfo("");
    printInfo(`Found ${skillNames.length} skill(s):`);
    for (const name of skillNames) {
      printInfo(`  - ${name}`);
    }
    return;
  }

  const selected = normalizeSkillSelection(skillNames, options.skill ?? []);
  if (selected.length === 0) {
    throw new Error("No matching skills found. Use --list to see available skills.");
  }

  const summary: RepoInstallSummary = { installed: [], updated: [], skipped: [], failed: [] };
  const index = await loadIndex();

  for (const skill of skills) {
    if (!selected.includes(skill.name)) {
      continue;
    }

    const alreadyInstalled = index.skills.some((entry) => entry.name === skill.name);

    try {
      const skillMarkdown = await fetchRepoFile(
        ref,
        ref.path ? `${ref.path}/${skill.skillFile}` : skill.skillFile
      );
      const parsed = parseSkillMarkdown(skillMarkdown);
      if (!parsed.description) {
        summary.skipped.push(skill.name);
        continue;
      }

      await writeRepoSkillDirectory(ref, skill.path, skill.name);

      const sourcePath = [ref.path, skill.path].filter(Boolean).join("/");
      const source = {
        type: "git" as const,
        repo: `${ref.owner}/${ref.repo}`,
        path: sourcePath || undefined,
        ref: ref.ref,
      };

      const metadata = buildMetadata(parsed, source, skill.name);
      await writeSkillMetadata(skill.name, metadata);
      const updated = upsertSkill(index, {
        name: skill.name,
        source,
        checksum: parsed.checksum,
        updatedAt: metadata.updatedAt,
      });

      const installs: SkillInstall[] = [];
      await installSkillTargets(skill.name, options, installs);

      const nextIndex = upsertSkill(updated, {
        name: skill.name,
        source,
        checksum: parsed.checksum,
        updatedAt: metadata.updatedAt,
        installs,
      });

      index.skills = nextIndex.skills;
      if (alreadyInstalled) {
        summary.updated.push(skill.name);
      } else {
        summary.installed.push(skill.name);
      }
    } catch (error) {
      const message = getErrorMessage(error, "unknown");
      summary.failed.push({ name: skill.name, reason: message });
    }
  }

  await saveIndex(sortIndex(index));

  if (options.json) {
    printJson({ ok: true, command: "add", data: { repo: `${ref.owner}/${ref.repo}`, ...summary } });
    return;
  }

  printInfo(`Skills Added from: ${ref.owner}/${ref.repo}`);
  printInfo("");
  printInfo("Source: git");
  printInfo(`  ${ref.owner}/${ref.repo}${ref.path ? `/${ref.path}` : ""} (${ref.ref})`);

  if (summary.installed.length > 0) {
    printInfo("");
    printInfo(`Installed (${summary.installed.length}):`);
    for (const name of summary.installed) {
      printInfo(`  ✓ ${name}`);
    }
  }

  if (summary.updated.length > 0) {
    printInfo("");
    printInfo(`Updated (${summary.updated.length}):`);
    for (const name of summary.updated) {
      printInfo(`  ✓ ${name}`);
    }
  }

  if (summary.skipped.length > 0) {
    printInfo("");
    printInfo(`Skipped (${summary.skipped.length}):`);
    for (const name of summary.skipped) {
      printInfo(`  - ${name} (missing description)`);
    }
  }

  if (summary.failed.length > 0) {
    printInfo("");
    printInfo(`Failed (${summary.failed.length}):`);
    for (const failure of summary.failed) {
      printInfo(`  ✗ ${failure.name} (${failure.reason})`);
    }
  }

  const total = summary.installed.length + summary.updated.length;
  if (total === 0) {
    printInfo("");
    printInfo("No skills were added.");
  }
}
