import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { fetchText } from "../lib/fetcher.js";
import { loadIndex, saveIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { fetchRepoManifest, normalizeRepoRef } from "../lib/repo-skills.js";
import type { SkillSource } from "../lib/types.js";
import { hasManagedEdits, readManagedManifest } from "../lib/managed-manifest.js";
import { hashContent, skillDir } from "../lib/skill-store.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";

type SkillStatus = {
  name: string;
  source: string;
  trackable: boolean;
  outdated: boolean;
  localChecksum: string;
  remoteChecksum?: string;
  checkedContent?: "managed-tree" | "SKILL.md";
  error?: string;
};

type SourceGroup = {
  source: string;
  skills: SkillStatus[];
  trackable: boolean;
  outdatedCount: number;
  upToDateCount: number;
};

export async function checkSkillStatus(skill: {
  name: string;
  source: SkillSource;
  checksum: string;
}): Promise<SkillStatus> {
  const isTrackable = skill.source.type === "url" || skill.source.type === "git";

  if (!isTrackable) {
    return {
      name: skill.name,
      source: skill.source.type,
      trackable: isTrackable,
      outdated: false,
      localChecksum: skill.checksum,
    };
  }

  try {
    let remoteChecksum: string;
    let outdated: boolean;
    const checkedContent =
      skill.source.type === "git" ? ("managed-tree" as const) : ("SKILL.md" as const);
    if (skill.source.type === "git") {
      const baseline = await readManagedManifest(skillDir(skill.name));
      if (!baseline)
        throw new Error(
          "Unknown full-tree status: no managed-file baseline; run migrate-baseline to establish provenance."
        );
      if (await hasManagedEdits(skillDir(skill.name))) {
        throw new Error(
          "Local files differ from the managed baseline; full-tree status is unknown."
        );
      }
      const [owner, repo] = (skill.source.repo ?? "").split("/");
      if (!owner || !repo) throw new Error("Invalid Git source.");
      const ref = await normalizeRepoRef({ owner, repo, ref: skill.source.ref ?? "main" });
      const remote = await fetchRepoManifest(ref, skill.source.path ?? "");
      remoteChecksum = remote["SKILL.md"];
      outdated =
        Object.keys(baseline).length !== Object.keys(remote).length ||
        Object.entries(remote).some(([name, checksum]) => baseline[name] !== checksum);
    } else {
      if (!skill.source.url) throw new Error("Missing source URL.");
      remoteChecksum = hashContent(await fetchText(skill.source.url));
      outdated = remoteChecksum !== skill.checksum;
    }

    return {
      name: skill.name,
      source: skill.source.type,
      trackable: true,
      outdated,
      localChecksum: skill.checksum,
      remoteChecksum,
      checkedContent,
    };
  } catch (err) {
    return {
      name: skill.name,
      source: skill.source.type,
      trackable: true,
      outdated: false,
      localChecksum: skill.checksum,
      error: err instanceof Error ? err.message : "Failed to check",
    };
  }
}

// Sort sources: url first, then git, then local (for status command - trackable first)
const STATUS_SOURCE_ORDER = ["url", "git", "local"];

function groupBySource(statuses: SkillStatus[]): SourceGroup[] {
  const grouped = groupAndSort(statuses, (s) => s.source, STATUS_SOURCE_ORDER, sortByName);

  return grouped.map(({ key, items }) => {
    const trackable = items.some((s) => s.trackable);
    const outdatedCount = items.filter((s) => s.outdated).length;
    const upToDateCount = items.filter((s) => s.trackable && !s.outdated && !s.error).length;

    return {
      source: key,
      skills: items,
      trackable,
      outdatedCount,
      upToDateCount,
    };
  });
}

function formatSourceHeader(group: SourceGroup): string {
  const count = group.skills.length;
  const skillWord = count === 1 ? "skill" : "skills";

  if (!group.trackable) {
    return `${group.source} (${count} ${skillWord} - not tracked)`;
  }

  if (group.outdatedCount > 0) {
    return `${group.source} (${count} ${skillWord}, ${group.outdatedCount} outdated)`;
  }

  return `${group.source} (${count} ${skillWord})`;
}

function printSourceGroup(group: SourceGroup): void {
  printInfo(formatSourceHeader(group));

  for (const skill of group.skills) {
    if (!group.trackable) {
      printInfo(`  ${skill.name}`);
    } else if (skill.error) {
      printInfo(`  ? ${skill.name} (${skill.error})`);
    } else if (skill.outdated) {
      printInfo(`  ✗ ${skill.name} (outdated)`);
    } else {
      printInfo(`  ✓ ${skill.name}`);
    }
  }
}

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Compare Git managed trees and URL SKILL.md checksums with remote sources")
    .option("--json", "JSON output")
    .action(async (options) => {
      try {
        const index = await loadIndex();
        const statuses: SkillStatus[] = [];

        for (const skill of index.skills) {
          const status = await checkSkillStatus(skill);
          statuses.push(status);

          // Update lastChecked for trackable skills
          if (status.trackable && !status.error) {
            skill.lastChecked = new Date().toISOString();
          }
        }

        await saveIndex(index);

        const sourceGroups = groupBySource(statuses);
        const totalOutdated = statuses.filter((s) => s.outdated).length;
        const totalTrackable = statuses.filter((s) => s.trackable).length;
        const totalUpToDate = statuses.filter((s) => s.trackable && !s.outdated && !s.error).length;

        const failed = statuses.filter((s) => s.error).length;
        if (failed) process.exitCode = 1;
        if (isJsonEnabled(options)) {
          printJson({
            ok: failed === 0,
            command: "status",
            data: {
              checkedContent: { git: "managed-tree", url: "SKILL.md" },
              total: statuses.length,
              outdated: totalOutdated,
              upToDate: totalUpToDate,
              trackable: totalTrackable,
              skills: statuses,
              bySource: sourceGroups,
            },
          });
          return;
        }

        printInfo("Skill Status");

        for (const group of sourceGroups) {
          printInfo("");
          printSourceGroup(group);
        }

        // Summary line if there are outdated skills
        if (totalOutdated > 0) {
          printInfo("");
          printInfo(`Run 'skillbox update' to update ${totalOutdated} outdated skill(s).`);
        }
      } catch (error) {
        handleCommandError(options, "status", error);
      }
    });
}
