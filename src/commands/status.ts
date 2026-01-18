import type { Command } from "commander";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadIndex, saveIndex } from "../lib/index.js";
import { fetchText } from "../lib/fetcher.js";
import { hashContent } from "../lib/skill-store.js";

export const registerStatus = (program: Command): void => {
  program
    .command("status")
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
        }>;

        for (const skill of index.skills) {
          if (skill.source.type !== "url" || !skill.source.url) {
            results.push({
              name: skill.name,
              source: skill.source.type,
              outdated: false,
              localChecksum: skill.checksum
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
            remoteChecksum
          });
        }

        await saveIndex(index);

        const outdated = results.filter((entry) => entry.outdated).map((entry) => entry.name);
        const upToDate = results.filter((entry) => !entry.outdated).map((entry) => entry.name);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "status",
            data: {
              outdated,
              upToDate,
              results
            }
          });
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
