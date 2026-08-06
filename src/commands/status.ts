import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { loadIndex, saveIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";
import { checkSkillStatus, type SkillStatus } from "../lib/status-check.js";

type SourceGroup = {
  source: string;
  skills: SkillStatus[];
  trackable: boolean;
  outdatedCount: number;
  upToDateCount: number;
};

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

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "status",
            data: {
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
