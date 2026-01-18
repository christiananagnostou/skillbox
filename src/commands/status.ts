import type { Command } from "commander";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadIndex, saveIndex } from "../lib/index.js";
import { fetchText } from "../lib/fetcher.js";
import { hashContent } from "../lib/skill-store.js";

export const registerStatus = (program: Command): void => {
  program
    .command("status")
    .option("--group <group>", "Group by project")
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
          const projects = (skill.installs ?? [])
            .filter((install) => install.scope === "project" && install.projectRoot)
            .map((install) => install.projectRoot as string);

          if (skill.source.type !== "url" || !skill.source.url) {
            results.push({
              name: skill.name,
              source: skill.source.type,
              outdated: false,
              localChecksum: skill.checksum,
              projects
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
            projects
          });
        }

        await saveIndex(index);

        const outdated = results.filter((entry) => entry.outdated).map((entry) => entry.name);
        const upToDate = results.filter((entry) => !entry.outdated).map((entry) => entry.name);
        const grouped = groupByProject(results);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "status",
            data: {
              group: options.group ?? null,
              outdated,
              upToDate,
              results,
              projects: options.group === "project" ? grouped : undefined
            }
          });
          return;
        }

        if (options.group === "project") {
          printInfo(`Projects: ${grouped.length}`);
          for (const project of grouped) {
            printInfo(`- ${project.root}`);
            if (project.outdated.length > 0) {
              printInfo("  Outdated:");
              for (const name of project.outdated) {
                printInfo(`    - ${name}`);
              }
            }
            if (project.upToDate.length > 0) {
              printInfo("  Up to date:");
              for (const name of project.upToDate) {
                printInfo(`    - ${name}`);
              }
            }
          }
          return;
        }

        printInfo(`Outdated: ${outdated.length}`);
        for (const name of outdated) {
          printInfo(`- ${name}`);
        }
        printInfo(`Up to date: ${upToDate.length}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "status", error: { message } });
          return;
        }
        printError(message);
      }
    });
};

const groupByProject = (results: Array<{ name: string; outdated: boolean; projects: string[] }>) => {
  const map = new Map<string, { root: string; outdated: string[]; upToDate: string[] }>();
  for (const result of results) {
    for (const project of result.projects) {
      const entry = map.get(project) ?? { root: project, outdated: [], upToDate: [] };
      if (result.outdated) {
        entry.outdated.push(result.name);
      } else {
        entry.upToDate.push(result.name);
      }
      map.set(project, entry);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.root.localeCompare(b.root));
};
