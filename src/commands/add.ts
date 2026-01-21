import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { fetchText } from "../lib/fetcher.js";
import { collect } from "../lib/fs-utils.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { ensureProjectRegistered, resolveRuntime } from "../lib/runtime.js";
import { buildMetadata, inferNameFromUrl, parseSkillMarkdown } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "../lib/sync.js";
import { handleRepoInstall, isRepoUrl } from "./add-repo.js";

type InstallEntry = {
  scope: "user" | "project";
  agent: string;
  path: string;
  projectRoot?: string;
};

export function registerAdd(program: Command): void {
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

        if (!parsed.description) {
          throw new Error(
            "Skill frontmatter missing description. Convert the source into a valid skill."
          );
        }

        const metadata = buildMetadata(parsed, { type: "url", url }, skillName);

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
        const installs: InstallEntry[] = [];
        const recordedPaths = new Set<string>();

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
          const warnings = buildSymlinkWarning(agent, results);
          for (const warning of warnings) {
            printInfo(warning);
          }
          const deduped = written.filter((target) => !recordedPaths.has(target));
          if (deduped.length > 0) {
            installed.push({ agent, scope, targets: deduped });
            for (const target of deduped) {
              recordedPaths.add(target);
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
              source: { type: "url", url },
              scope,
              installs,
            },
          });
          return;
        }

        printInfo(`Skill Added: ${skillName}`);
        printInfo("");
        printInfo("Source: url");
        printInfo(`  ${url}`);

        if (installs.length > 0) {
          printInfo("");
          printInfo("Installed to:");
          for (const install of installs) {
            const scopeLabel =
              install.scope === "project" ? `project:${install.projectRoot}` : "user";
            printInfo(`  ✓ ${scopeLabel}/${install.agent}`);
          }
        } else {
          printInfo("");
          printInfo("No agent targets were updated.");
        }
      } catch (error) {
        handleCommandError(options, "add", error);
      }
    });
}
