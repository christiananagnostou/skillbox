import type { RepoRef } from "../lib/github.js";
import {
  listRepoSkills,
  normalizeRepoRef,
  fetchRepoFile,
  writeRepoSkillDirectory,
} from "../lib/repo-skills.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { writeSkillMetadata } from "../lib/skill-store.js";
import { loadConfig } from "../lib/config.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { resolveRuntime, ensureProjectRegistered } from "../lib/runtime.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "../lib/sync.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { printInfo, printJson } from "../lib/output.js";
import { parseRepoRef } from "../lib/github.js";
import { getErrorMessage } from "../lib/command.js";

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

const normalizeSkillSelection = (skills: string[], selections: string[]): string[] => {
  if (selections.length === 0) {
    return skills;
  }
  const selectionSet = new Set(selections);
  return skills.filter((name) => selectionSet.has(name));
};

const ensureRepoRef = async (input: string): Promise<RepoRef> => {
  const ref = parseRepoRef(input);
  if (!ref) {
    throw new Error("Unsupported repo URL or shorthand.");
  }
  return await normalizeRepoRef(ref);
};

const installSkillTargets = async (
  skillName: string,
  options: RepoAddOptions,
  installs: Array<{ scope: "user" | "project"; agent: string; path: string; projectRoot?: string }>
) => {
  const { projectRoot, scope, agentList } = await resolveRuntime({
    global: options.global,
    agents: options.agents,
  });
  const projectEntry = await ensureProjectRegistered(projectRoot, scope);
  const paths = buildProjectAgentPaths(projectRoot, projectEntry);
  const config = await loadConfig();

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

    const warning = buildSymlinkWarning(agent, results);
    if (warning) {
      printInfo(warning);
    }

    if (written.length > 0) {
      for (const target of written) {
        installs.push({
          scope,
          agent,
          path: target,
          projectRoot: scope === "project" ? projectRoot : undefined,
        });
      }
    }
  }
};

export const isRepoUrl = (input: string): boolean => {
  return Boolean(parseRepoRef(input));
};

export const handleRepoInstall = async (input: string, options: RepoAddOptions) => {
  const ref = await ensureRepoRef(input);
  const { skills } = await listRepoSkills(ref);

  const skillNames = skills.map((skill) => skill.name).sort();

  if (options.list) {
    if (options.json) {
      printJson({ ok: true, command: "add", data: { repo: input, skills: skillNames } });
      return;
    }
    printInfo(`Skills found: ${skillNames.length}`);
    for (const name of skillNames) {
      printInfo(`- ${name}`);
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

      const installs: Array<{
        scope: "user" | "project";
        agent: string;
        path: string;
        projectRoot?: string;
      }> = [];
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
    printJson({ ok: true, command: "add", data: summary });
    return;
  }

  if (summary.failed.length > 0) {
    printInfo("Some skills failed to install:");
    for (const failure of summary.failed) {
      printInfo(`- ${failure.name}: ${failure.reason}`);
    }
  }
  if (summary.installed.length > 0) {
    printInfo(`Installed ${summary.installed.length} skill(s): ${summary.installed.join(", ")}`);
  }
  if (summary.updated.length > 0) {
    printInfo(`Updated ${summary.updated.length} skill(s): ${summary.updated.join(", ")}`);
  }
  if (summary.skipped.length > 0) {
    printInfo(`Skipped ${summary.skipped.length} skill(s): ${summary.skipped.join(", ")}`);
  }
  if (summary.installed.length === 0 && summary.updated.length === 0) {
    printInfo("No agent targets were updated (canonical store only).");
  }
};
