import type { Command } from "commander";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { fetchText } from "../lib/fetcher.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { copySkillToInstallPaths } from "../lib/sync.js";

export const registerUpdate = (program: Command): void => {
  program
    .command("update")
    .argument("[name]", "Skill name")
    .option("--system", "Allow system-scope updates")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const targets = name
          ? index.skills.filter((skill) => skill.name === name)
          : index.skills;

        if (name && targets.length === 0) {
          throw new Error(`Skill not found: ${name}`);
        }

        const updated: string[] = [];
        await ensureSkillsDir();

        for (const skill of targets) {
          if (skill.source.type !== "url" || !skill.source.url) {
            continue;
          }

          const markdown = await fetchText(skill.source.url);
          const parsed = parseSkillMarkdown(markdown);

          if (!parsed.description) {
            throw new Error(`Skill ${skill.name} is missing a description after update.`);
          }

          const metadata = buildMetadata(parsed, { type: "url", url: skill.source.url }, skill.name);
          await writeSkillFiles(skill.name, markdown, metadata);

          const installPaths = (skill.installs ?? [])
            .filter((install) => options.system || install.scope !== "system")
            .map((install) => install.path);

          if (installPaths.length > 0) {
            await copySkillToInstallPaths(skill.name, installPaths);
          }

          const nextIndex = upsertSkill(index, {
            name: skill.name,
            source: { type: "url", url: skill.source.url },
            checksum: parsed.checksum,
            updatedAt: metadata.updatedAt,
            lastSync: new Date().toISOString()
          });
          index.skills = nextIndex.skills;
          updated.push(skill.name);
        }

        await saveIndex(sortIndex(index));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "update",
            data: {
              name: name ?? null,
              system: Boolean(options.system),
              updated
            }
          });
          return;
        }

        if (updated.length === 0) {
          printInfo("No skills updated.");
          return;
        }

        printInfo(`Updated ${updated.length} skill(s):`);
        for (const skillName of updated) {
          printInfo(`- ${skillName}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "update", error: { message } });
          return;
        }
        printError(message);
      }
    });
};
