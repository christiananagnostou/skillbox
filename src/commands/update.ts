import type { Command } from "commander";
import path from "node:path";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { fetchText } from "../lib/fetcher.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { getInstallPaths } from "../lib/installs.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { fetchRepoFile, normalizeRepoRef, writeRepoSkillDirectory } from "../lib/repo-skills.js";
import { buildMetadata, parseSkillMarkdown } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles, writeSkillMetadata } from "../lib/skill-store.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";
import { installSkillToTargets } from "../lib/sync.js";
import type { IndexedSkill, SkillIndex } from "../lib/types.js";

type UpdateResult = {
  name: string;
  source: string;
  status: "updated" | "failed" | "skipped";
  error?: string;
};

type SourceGroup = {
  source: string;
  results: UpdateResult[];
  updatedCount: number;
  failedCount: number;
};

// Sort sources: url first, then git (trackable sources first)
const UPDATE_SOURCE_ORDER = ["url", "git", "local"];

function groupBySource(results: UpdateResult[]): SourceGroup[] {
  const grouped = groupAndSort(results, (r) => r.source, UPDATE_SOURCE_ORDER, sortByName);

  return grouped.map(({ key, items }) => ({
    source: key,
    results: items,
    updatedCount: items.filter((r) => r.status === "updated").length,
    failedCount: items.filter((r) => r.status === "failed").length,
  }));
}

function formatSourceHeader(group: SourceGroup): string {
  const count = group.results.length;
  const skillWord = count === 1 ? "skill" : "skills";

  if (group.source === "local") {
    return `${group.source} (${count} ${skillWord} - skipped)`;
  }

  if (group.failedCount > 0) {
    return `${group.source} (${count} ${skillWord}, ${group.failedCount} failed)`;
  }

  return `${group.source} (${count} ${skillWord})`;
}

function printSourceGroup(group: SourceGroup): void {
  printInfo(formatSourceHeader(group));

  for (const result of group.results) {
    if (result.status === "skipped") {
      printInfo(`  - ${result.name}`);
    } else if (result.status === "failed") {
      printInfo(`  ✗ ${result.name} (${result.error ?? "failed"})`);
    } else {
      printInfo(`  ✓ ${result.name}`);
    }
  }
}

async function updateUrlSkill(
  skill: IndexedSkill,
  index: SkillIndex,
  projectRoot: string | null,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  if (!skill.source.url) {
    return;
  }

  const markdown = await fetchText(skill.source.url);
  const parsed = parseSkillMarkdown(markdown);

  if (!parsed.description) {
    throw new Error(`Skill ${skill.name} is missing a description after update.`);
  }

  const metadata = buildMetadata(parsed, { type: "url", url: skill.source.url }, skill.name);
  await writeSkillFiles(skill.name, markdown, metadata);

  const installPaths = getInstallPaths(skill, projectRoot);
  if (installPaths.length > 0) {
    await installSkillToTargets(skill.name, installPaths, config);
  }

  const nextIndex = upsertSkill(index, {
    name: skill.name,
    source: { type: "url", url: skill.source.url },
    checksum: parsed.checksum,
    updatedAt: metadata.updatedAt,
    lastSync: new Date().toISOString(),
  });
  index.skills = nextIndex.skills;
}

async function updateGitSkill(
  skill: IndexedSkill,
  index: SkillIndex,
  projectRoot: string | null,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  if (!skill.source.repo) {
    return;
  }

  const [owner, repo] = skill.source.repo.split("/");
  if (!owner || !repo) {
    return;
  }

  const skillPath = skill.source.path?.replace(/\/$/, "") ?? "";
  const ref = await normalizeRepoRef({
    owner,
    repo,
    ref: skill.source.ref ?? "main",
  });
  const skillFilePath = skillPath ? `${skillPath}/SKILL.md` : "SKILL.md";
  const markdown = await fetchRepoFile(ref, skillFilePath);
  const parsed = parseSkillMarkdown(markdown);

  if (!parsed.description) {
    throw new Error(`Skill ${skill.name} is missing a description after update.`);
  }

  await writeRepoSkillDirectory(ref, skillPath, skill.name);

  const source = {
    type: "git" as const,
    repo: skill.source.repo,
    path: skillPath || undefined,
    ref: ref.ref,
  };
  const metadata = buildMetadata(parsed, source, skill.name);
  await writeSkillMetadata(skill.name, metadata);

  const installPaths = getInstallPaths(skill, projectRoot);
  if (installPaths.length > 0) {
    await installSkillToTargets(skill.name, installPaths, config);
  }

  const nextIndex = upsertSkill(index, {
    name: skill.name,
    source,
    checksum: parsed.checksum,
    updatedAt: metadata.updatedAt,
    lastSync: new Date().toISOString(),
  });
  index.skills = nextIndex.skills;
}

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .argument("[name]", "Skill name")
    .option("--project <path>", "Only update installs for a project")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const targets = name ? index.skills.filter((skill) => skill.name === name) : index.skills;

        if (name && targets.length === 0) {
          throw new Error(`Skill not found: ${name}`);
        }

        await ensureSkillsDir();

        const config = await loadConfig();
        const projectRoot = options.project ? path.resolve(options.project) : null;
        const results: UpdateResult[] = [];

        for (const skill of targets) {
          if (skill.source.type === "url") {
            try {
              await updateUrlSkill(skill, index, projectRoot, config);
              results.push({ name: skill.name, source: "url", status: "updated" });
            } catch (err) {
              results.push({
                name: skill.name,
                source: "url",
                status: "failed",
                error: err instanceof Error ? err.message : "unknown error",
              });
            }
          } else if (skill.source.type === "git") {
            try {
              await updateGitSkill(skill, index, projectRoot, config);
              results.push({ name: skill.name, source: "git", status: "updated" });
            } catch (err) {
              results.push({
                name: skill.name,
                source: "git",
                status: "failed",
                error: err instanceof Error ? err.message : "unknown error",
              });
            }
          } else {
            results.push({ name: skill.name, source: skill.source.type, status: "skipped" });
          }
        }

        await saveIndex(sortIndex(index));

        const sourceGroups = groupBySource(results);
        const totalUpdated = results.filter((r) => r.status === "updated").length;
        const totalFailed = results.filter((r) => r.status === "failed").length;
        const totalSkipped = results.filter((r) => r.status === "skipped").length;
        const totalTrackable = results.filter((r) => r.source !== "local").length;

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "update",
            data: {
              name: name ?? null,
              project: projectRoot,
              total: results.length,
              updated: totalUpdated,
              failed: totalFailed,
              skipped: totalSkipped,
              results,
              bySource: sourceGroups,
            },
          });
          return;
        }

        if (results.length === 0) {
          printInfo("No skills to update.");
          return;
        }

        printInfo("Skill Update");

        for (const group of sourceGroups) {
          printInfo("");
          printSourceGroup(group);
        }

        // Summary line
        printInfo("");
        if (totalFailed > 0) {
          printInfo(
            `Updated ${totalUpdated} of ${totalTrackable} trackable skills (${totalFailed} failed).`
          );
        } else if (totalUpdated > 0) {
          printInfo(`Updated ${totalUpdated} of ${totalTrackable} trackable skills.`);
        } else if (totalSkipped > 0 && totalTrackable === 0) {
          printInfo("No trackable skills to update.");
        }
      } catch (error) {
        handleCommandError(options, "update", error);
      }
    });
}
