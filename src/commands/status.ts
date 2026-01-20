import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson, printList } from "../lib/output.js";
import { loadIndex, saveIndex } from "../lib/index.js";
import { fetchText } from "../lib/fetcher.js";
import { hashContent } from "../lib/skill-store.js";
import { groupStatusByKey } from "../lib/grouping.js";
import { handleCommandError } from "../lib/command.js";

export const registerStatus = (program: Command): void => {
  program
    .command("status")
    .option("--group <group>", "Group by project or source")
    .option("--json", "JSON output")
    .action(async (options) => {
      try {
        const index = await loadIndex();
        const results = [] as Array<{
          name: string;
          source: string;
          outdated: boolean;
          localChecksum: string;
          remoteChecksum?: string;
          projects: string[];
        }>;

        for (const skill of index.skills) {
          const projects = Array.from(
            new Set(
              (skill.installs ?? [])
                .filter((install) => install.scope === "project" && install.projectRoot)
                .map((install) => install.projectRoot as string)
            )
          );

          if (skill.source.type !== "url" || !skill.source.url) {
            results.push({
              name: skill.name,
              source: skill.source.type,
              outdated: false,
              localChecksum: skill.checksum,
              projects,
            });
            continue;
          }

          const remoteText = await fetchText(skill.source.url);
          const remoteChecksum = hashContent(remoteText);
          const outdated = remoteChecksum !== skill.checksum;
          skill.lastChecked = new Date().toISOString();

          results.push({
            name: skill.name,
            source: skill.source.type,
            outdated,
            localChecksum: skill.checksum,
            remoteChecksum,
            projects,
          });
        }

        await saveIndex(index);

        const outdated = results.filter((entry) => entry.outdated).map((entry) => entry.name);
        const upToDate = results.filter((entry) => !entry.outdated).map((entry) => entry.name);
        const groupedProjects = groupByProject(results);
        const groupedSources = groupBySource(results);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "status",
            data: {
              group: options.group ?? null,
              outdated,
              upToDate,
              results,
              projects: options.group === "project" ? groupedProjects : undefined,
              sources: options.group === "source" ? groupedSources : undefined,
            },
          });
          return;
        }

        if (options.group === "project") {
          printInfo(`Projects: ${groupedProjects.length}`);
          for (const project of groupedProjects) {
            printInfo(`- ${project.root}`);
            if (project.outdated.length > 0) {
              printList("  Outdated", project.outdated, "    - ");
            }
            if (project.upToDate.length > 0) {
              printList("  Up to date", project.upToDate, "    - ");
            }
          }
          return;
        }

        if (options.group === "source") {
          printInfo(`Sources: ${groupedSources.length}`);
          for (const source of groupedSources) {
            printInfo(`- ${source.source}`);
            if (source.outdated.length > 0) {
              printList("  Outdated", source.outdated, "    - ");
            }
            if (source.upToDate.length > 0) {
              printList("  Up to date", source.upToDate, "    - ");
            }
          }
          return;
        }

        printList("Outdated", outdated);
        printList("Up to date", upToDate);
      } catch (error) {
        handleCommandError(options, "status", error);
      }
    });
};

const groupByProject = (
  results: Array<{ name: string; outdated: boolean; projects: string[] }>
) => {
  const grouped = groupStatusByKey(
    results,
    (result) => result.name,
    (result) => result.outdated,
    (result) => result.projects
  );
  return grouped.map((group) => ({
    root: group.key,
    outdated: group.outdated,
    upToDate: group.upToDate,
  }));
};

const groupBySource = (results: Array<{ name: string; outdated: boolean; source: string }>) => {
  const grouped = groupStatusByKey(
    results,
    (result) => result.name,
    (result) => result.outdated,
    (result) => [result.source]
  );
  return grouped.map((group) => ({
    source: group.key,
    outdated: group.outdated,
    upToDate: group.upToDate,
  }));
};
