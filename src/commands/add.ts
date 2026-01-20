import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { fetchText } from "../lib/fetcher.js";
import { parseSkillMarkdown, inferNameFromUrl, buildMetadata } from "../lib/skill-parser.js";
import { handleCommandError } from "../lib/command.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { buildTargets, installSkillToTargets } from "../lib/sync.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { resolveRuntime, ensureProjectRegistered } from "../lib/runtime.js";
import { loadConfig } from "../lib/config.js";
import { handleRepoInstall, isRepoUrl } from "./add-repo.js";

export const registerAdd = (program: Command): void => {
  program
    .command("add")
    .argument("<url>", "Skill URL or repo")
    .option("--name <name>", "Override skill name")
    .option("--global", "Install to user scope")
    .option("--agents <list>", "Comma-separated agent list")
    .option("--skill <skill>", "Skill name to install", collect)
    .option("--list", "List skills in repo without installing")
    .option("--json", "JSON output")
    .action(async (url, options) => {
      try {
        if (options.list || options.skill || isRepoUrl(url)) {
          await handleRepoInstall(url, {
            global: options.global,
            agents: options.agents,
            json: options.json,
            list: options.list,
            skill: options.skill,
          });
          return;
        }

        const skillMarkdown = await fetchText(url);
        const parsed = parseSkillMarkdown(skillMarkdown);
        const inferred = inferNameFromUrl(url);
        const skillName = options.name ?? inferred ?? parsed.name;

        if (!skillName) {
          throw new Error("Unable to infer skill name. Use --name to specify it.");
        }

        if (!parsed.name && !options.name) {
          throw new Error("Skill frontmatter missing name. Provide --name to continue.");
        }

        const metadata = buildMetadata(parsed, { type: "url", url }, skillName);

        if (!parsed.description) {
          throw new Error(
            "Skill frontmatter missing description. Convert the source into a valid skill."
          );
        }

        await ensureSkillsDir();
        await writeSkillFiles(skillName, skillMarkdown, metadata);

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
        });

        const { projectRoot, scope, agentList } = await resolveRuntime({
          global: options.global,
          agents: options.agents,
        });
        const projectEntry = await ensureProjectRegistered(projectRoot, scope);
        const paths = buildProjectAgentPaths(projectRoot, projectEntry);
        const config = await loadConfig();
        const installed: { agent: string; scope: string; targets: string[] }[] = [];
        const installs = [] as Array<{
          scope: "user" | "project";
          agent: string;
          path: string;
          projectRoot?: string;
        }>;

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
          const skipped = results.filter((result) => result.mode === "skipped");
          if (skipped.length > 0) {
            const details = skipped
              .map((result) => `${result.path}: ${result.error ?? "unknown error"}`)
              .join("; ");
            printInfo(
              `Warning: symlink failed for ${agent}. ${details}. Remove the existing target or run "skillbox config set --install-mode copy" to use file copies.`
            );
          }
          if (written.length > 0) {
            installed.push({ agent, scope, targets: written });
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

        const nextIndex = upsertSkill(updated, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
          installs,
        });
        await saveIndex(sortIndex(nextIndex));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "add",
            data: {
              name: skillName,
              url,
              scope,
              agents: installed,
            },
          });
          return;
        }

        printInfo(`Installed skill: ${skillName}`);
        printInfo(`Source: ${url}`);
        printInfo(`Scope: ${scope}`);
        if (installed.length === 0) {
          printInfo("No agent targets were updated (canonical store only).");
        } else {
          for (const entry of installed) {
            printInfo(`Updated ${entry.agent}: ${entry.targets.join(", ")}`);
          }
        }
      } catch (error) {
        handleCommandError(options, "add", error);
      }
    });
};

const collect = (value: string, previous: string[] = []): string[] => {
  return [...previous, value];
};
