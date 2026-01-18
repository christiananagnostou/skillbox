import type { Command } from "commander";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { fetchText } from "../lib/fetcher.js";
import { parseSkillMarkdown, inferNameFromUrl, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { buildTargets, copySkillToTargets } from "../lib/sync.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { resolveRuntime, ensureProjectRegistered } from "../lib/runtime.js";

export const registerAdd = (program: Command): void => {
  program
    .command("add")
    .argument("<url>", "Skill URL")
    .option("--name <name>", "Override skill name")
    .option("--global", "Install to user scope")
    .option("--agents <list>", "Comma-separated agent list")
    .option("--json", "JSON output")
    .action(async (url, options) => {
      try {
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
          throw new Error("Skill frontmatter missing description. Convert the source into a valid skill.");
        }

        await ensureSkillsDir();
        await writeSkillFiles(skillName, skillMarkdown, metadata);

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt
        });

        const { projectRoot, scope, agentList } = await resolveRuntime(options);
        const projectEntry = await ensureProjectRegistered(projectRoot, scope);
        const paths = buildProjectAgentPaths(projectRoot, projectEntry);
        const installed: { agent: string; scope: string; targets: string[] }[] = [];
        const installs = [] as Array<{ scope: "user" | "project"; agent: string; path: string; projectRoot?: string }>;

        for (const agent of agentList) {
          const map = paths[agent];
          if (!map) {
            continue;
          }
          const targets = buildTargets(agent, map, scope).map((target) => target.path);
          const written = await copySkillToTargets(skillName, targets);
          installed.push({ agent, scope, targets: written });
          for (const target of written) {
            installs.push({
              scope,
              agent,
              path: target,
              projectRoot: scope === "project" ? projectRoot : undefined
            });
          }
        }

        const nextIndex = upsertSkill(updated, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
          installs
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
              agents: installed
            }
          });
          return;
        }

        printInfo(`Installed skill: ${skillName}`);
        printInfo(`Source: ${url}`);
        printInfo(`Scope: ${scope}`);
        if (installed.length === 0) {
          printInfo("No agent targets were updated.");
        } else {
          for (const entry of installed) {
            printInfo(`Updated ${entry.agent}: ${entry.targets.join(", ")}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "add", error: { message } });
          return;
        }
        printError(message);
      }
    });
};
