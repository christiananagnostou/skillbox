import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { fetchText } from "../lib/fetcher.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles, writeSkillMetadata } from "../lib/skill-store.js";
import path from "node:path";
import { installSkillToTargets } from "../lib/sync.js";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { fetchRepoFile, normalizeRepoRef, writeRepoSkillDirectory } from "../lib/repo-skills.js";
import { getInstallPaths } from "../lib/installs.js";

export const registerUpdate = (program: Command): void => {
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

        const updated: string[] = [];
        await ensureSkillsDir();

        const config = await loadConfig();
        const projectRoot = options.project ? path.resolve(options.project) : null;

        for (const skill of targets) {
          if (skill.source.type === "url" && skill.source.url) {
            const markdown = await fetchText(skill.source.url);
            const parsed = parseSkillMarkdown(markdown);

            if (!parsed.description) {
              throw new Error(`Skill ${skill.name} is missing a description after update.`);
            }

            const metadata = buildMetadata(
              parsed,
              { type: "url", url: skill.source.url },
              skill.name
            );
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
            updated.push(skill.name);
            continue;
          }

          if (skill.source.type !== "git" || !skill.source.repo) {
            continue;
          }

          const [owner, repo] = skill.source.repo.split("/");
          if (!owner || !repo) {
            continue;
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
          updated.push(skill.name);
        }

        await saveIndex(sortIndex(index));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "update",
            data: {
              name: name ?? null,
              project: projectRoot,
              updated,
            },
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
        handleCommandError(options, "update", error);
      }
    });
};
