import path from "node:path";
import { getErrorMessage } from "../lib/command.js";
import { readManagedManifest } from "../lib/managed-manifest.js";
import { skillDir } from "../lib/skill-store.js";
import { assertCanonicalReplaceable } from "../lib/managed-guard.js";
import { loadConfig } from "../lib/config.js";
import { parseRepoRef, type RepoRef } from "../lib/github.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { recordInstallPaths } from "../lib/installs.js";
import {
  printFailure,
  printInfo,
  printJson,
  printSkipped,
  printSuccess,
  startSpinner,
  stopSpinner,
} from "../lib/output.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import {
  fetchRepoFile,
  fetchRepoManifest,
  listRepoSkills,
  normalizeRepoRef,
  resolveRepoSnapshot,
  writeRepoSkillDirectory,
} from "../lib/repo-skills.js";
import { ensureProjectRegistered, resolveRuntime } from "../lib/runtime.js";
import { buildMetadata, parseSkillMarkdown } from "../lib/skill-parser.js";
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
): Promise<string[]> {
  const failures: string[] = [];
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
    const targets = buildTargets(agent, map, scope).map((target) =>
      path.join(target.path, skillName)
    );
    const results = await installSkillToTargets(skillName, targets, config);

    const warnings = buildSymlinkWarning(agent, results);
    if (!options.json) {
      for (const warning of warnings) printInfo(warning);
    }
    failures.push(
      ...results
        .filter((result) => result.error || result.mode === "skipped")
        .map((result) => `${result.path}: ${result.error ?? "install skipped"}`)
    );

    const successful = results
      .filter((result) => !result.error && result.mode !== "skipped")
      .map((result) => result.path);
    const deduped = recordInstallPaths(successful, recordedPaths);
    for (const target of deduped) {
      installs.push({
        scope,
        agent,
        path: target,
        projectRoot: scope === "project" ? projectRoot : undefined,
      });
    }
  }
  return failures;
}

export function isRepoUrl(input: string): boolean {
  return Boolean(parseRepoRef(input));
}

export async function handleRepoInstall(input: string, options: RepoAddOptions): Promise<void> {
  const ref = await ensureRepoRef(input);
  const snapshot = await resolveRepoSnapshot(ref);
  const { skills } = await listRepoSkills(snapshot);

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
  const showProgress = !options.json;
  const selectedSkills = skills.filter((s) => selected.includes(s.name));
  const total = selectedSkills.length;

  if (showProgress && total > 0) {
    printInfo(`Adding ${total} skill${total === 1 ? "" : "s"} from ${ref.owner}/${ref.repo}...\n`);
  }

  for (let i = 0; i < selectedSkills.length; i++) {
    const skill = selectedSkills[i];
    const progress = `(${i + 1}/${total})`;
    const alreadyInstalled = index.skills.some((entry) => entry.name === skill.name);

    if (showProgress) {
      startSpinner(`${skill.name} ${progress}`);
    }

    try {
      const sourcePath = [ref.path, skill.path].filter(Boolean).join("/");
      const source = {
        type: "git" as const,
        repo: `${ref.owner}/${ref.repo}`,
        path: sourcePath || undefined,
        ref: ref.ref,
      };

      await assertCanonicalReplaceable(skill.name, source);
      if (alreadyInstalled) {
        const baseline = await readManagedManifest(skillDir(skill.name));
        const remote = await fetchRepoManifest(snapshot, skill.path);
        if (
          !baseline ||
          Object.keys(baseline).length !== Object.keys(remote).length ||
          Object.entries(remote).some(([name, checksum]) => baseline[name] !== checksum)
        ) {
          throw new Error(
            `Skill ${skill.name} has upstream changes. Run unscoped update before adding another install.`
          );
        }
      }
      const skillMarkdown = await fetchRepoFile(
        snapshot,
        ref.path ? `${ref.path}/${skill.skillFile}` : skill.skillFile
      );
      const parsed = parseSkillMarkdown(skillMarkdown);
      if (!parsed.description) {
        summary.skipped.push(skill.name);
        if (showProgress) {
          printSkipped(skill.name, "missing description");
        }
        continue;
      }

      const metadata = buildMetadata(parsed, source, skill.name);
      if (!alreadyInstalled)
        await writeRepoSkillDirectory(snapshot, skill.path, skill.name, metadata);
      const updated = upsertSkill(index, {
        name: skill.name,
        source,
        checksum: parsed.checksum,
        updatedAt: metadata.updatedAt,
      });

      index.skills = updated.skills;
      await saveIndex(sortIndex(index));
      const installs: SkillInstall[] = [];
      const failures = await installSkillTargets(skill.name, options, installs);

      const nextIndex = upsertSkill(updated, {
        name: skill.name,
        source,
        checksum: parsed.checksum,
        updatedAt: metadata.updatedAt,
        installs,
      });

      index.skills = nextIndex.skills;
      await saveIndex(sortIndex(index));
      if (failures.length)
        throw new Error(`Canonical skill saved but installation failed: ${failures.join("; ")}`);
      if (alreadyInstalled) {
        summary.updated.push(skill.name);
        if (showProgress) {
          printSuccess(skill.name, "updated");
        }
      } else {
        summary.installed.push(skill.name);
        if (showProgress) {
          printSuccess(skill.name);
        }
      }
    } catch (error) {
      const message = getErrorMessage(error, "unknown");
      summary.failed.push({ name: skill.name, reason: message });
      if (showProgress) {
        printFailure(skill.name, message);
      }
    }
  }

  if (showProgress) {
    stopSpinner();
  }

  await saveIndex(sortIndex(index));

  if (summary.failed.length) process.exitCode = 1;
  if (options.json) {
    printJson({
      ok: summary.failed.length === 0,
      command: "add",
      data: { repo: `${ref.owner}/${ref.repo}`, ...summary },
    });
    return;
  }

  // Summary line
  const added = summary.installed.length + summary.updated.length;
  const failed = summary.failed.length;
  const skipped = summary.skipped.length;

  if (added > 0 && failed === 0 && skipped === 0) {
    printInfo(`\nAdded ${added} skill${added === 1 ? "" : "s"} from ${ref.owner}/${ref.repo}.`);
  } else if (added > 0) {
    const parts = [];
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    printInfo(`\nAdded ${added} skill${added === 1 ? "" : "s"} (${parts.join(", ")}).`);
  } else {
    printInfo("\nNo skills were added.");
  }
}
