import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import {
  buildIngestMetadata,
  buildIngestPrompt,
  buildSkillMarkdown,
  readIngestFile,
  writeIngestedSkillFiles,
} from "../lib/ingest.js";
import { installSkillToRuntime } from "../lib/install-runtime.js";
import { fetchText } from "../lib/fetcher.js";
import { collect } from "../lib/fs-utils.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { recordInstallPaths } from "../lib/installs.js";
import {
  isJsonEnabled,
  printInfo,
  printJson,
  printSuccess,
  startSpinner,
  stopSpinner,
} from "../lib/output.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { ensureProjectRegistered, resolveRuntime } from "../lib/runtime.js";
import { buildMetadata, inferNameFromUrl, parseSkillMarkdown } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "../lib/sync.js";
import type { SkillInstall } from "../lib/types.js";
import { handleRepoInstall, isRepoUrl } from "./add-repo.js";

async function resolveIngestPath(filePath: string): Promise<string> {
  if (filePath === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf8");
    if (!content.trim()) {
      throw new Error("Ingest stdin is empty.");
    }

    const { skillboxTmpDir } = await import("../lib/paths.js");
    await fs.mkdir(skillboxTmpDir(), { recursive: true });
    const tempFile = path.join(skillboxTmpDir(), "ingest-stdin.json");
    await fs.writeFile(tempFile, content, "utf8");
    return tempFile;
  }

  return filePath;
}

function isRawGitHubSkillUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.host === "raw.githubusercontent.com" &&
      (url.pathname.endsWith("/SKILL.md") || url.pathname.endsWith("/skill.md"))
    );
  } catch {
    return false;
  }
}

function buildFallbackDescription(skillName: string): string {
  return `Imported skill for ${skillName.replace(/-/g, " ")}.`;
}

export function registerAdd(program: Command): void {
  program
    .command("add")
    .argument("[input]", "Skill URL or repo")
    .option("--name <name>", "Override skill name")
    .option("--global", "Install to user scope")
    .option("--agents <list>", "Comma-separated agent list")
    .option("--skill <skill>", "Skill name to install", collect)
    .option("--list", "List skills in repo without installing")
    .option("--ingest <file>", "Ingest agent conversion JSON (use '-' for stdin)")
    .option("--json", "JSON output")
    .action(async (input, options) => {
      if (options.ingest) {
        await handleIngest(options.ingest, options);
        return;
      }

      try {
        if (!input) {
          throw new Error("Missing required argument: url or repo.");
        }

        if (options.list || options.skill || isRepoUrl(input)) {
          await handleRepoInstall(input, {
            global: options.global,
            agents: options.agents,
            json: options.json,
            list: options.list,
            skill: options.skill,
          });
          return;
        }

        const showProgress = !isJsonEnabled(options);
        const inferred = inferNameFromUrl(input);
        const displayName = options.name ?? inferred ?? "skill";

        if (showProgress) {
          startSpinner(`Adding ${displayName}`);
        }

        let skillMarkdown: string;
        try {
          skillMarkdown = await fetchText(input);
        } catch (error) {
          if (isRawGitHubSkillUrl(input)) {
            if (showProgress) {
              stopSpinner();
            }
            process.exitCode = 1;
            throw error;
          }
          if (showProgress) {
            stopSpinner();
          }
          await handlePromptFallback(input, options);
          return;
        }

        let parsed = parseSkillMarkdown(skillMarkdown);
        let skillName = options.name ?? inferred ?? parsed.name;

        if (
          isRawGitHubSkillUrl(input) &&
          skillName &&
          (!parsed.description || (!parsed.name && !options.name))
        ) {
          const description = parsed.description ?? buildFallbackDescription(skillName);
          skillMarkdown = `---\nname: ${skillName}\ndescription: ${description}\n---\n\n${skillMarkdown}`;
          parsed = parseSkillMarkdown(skillMarkdown);
          skillName = options.name ?? inferred ?? parsed.name;
        }

        if (!skillName || !parsed.description || (!parsed.name && !options.name)) {
          if (showProgress) {
            stopSpinner();
          }
          await handlePromptFallback(input, options);
          return;
        }

        const metadata = buildMetadata(parsed, { type: "url", url: input }, skillName);

        await ensureSkillsDir();
        await writeSkillFiles(skillName, skillMarkdown, metadata);

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name: skillName,
          source: { type: "url", url: input },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
          namespace: metadata.namespace,
          categories: metadata.categories,
          tags: metadata.tags,
        });

        const { projectRoot, scope, agentList } = await resolveRuntime({
          global: options.global,
          agents: options.agents,
        });
        const projectEntry = await ensureProjectRegistered(projectRoot, scope);
        const paths = buildProjectAgentPaths(projectRoot, projectEntry);
        const config = await loadConfig();
        const installs: SkillInstall[] = [];
        const recordedPaths = new Set<string>();

        for (const agent of agentList) {
          const map = paths[agent];
          if (!map) {
            continue;
          }

          const targets = buildTargets(agent, map, scope).map((target) =>
            path.join(target.path, skillName)
          );
          const results = await installSkillToTargets(skillName, targets, config);
          const warnings = buildSymlinkWarning(agent, results);
          for (const warning of warnings) {
            printInfo(warning);
          }

          const deduped = recordInstallPaths(targets, recordedPaths);
          for (const target of deduped) {
            installs.push({
              scope,
              agent,
              path: target,
              projectRoot: scope === "project" ? projectRoot : undefined,
            });
          }
        }

        const nextIndex = upsertSkill(updated, {
          name: skillName,
          source: { type: "url", url: input },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
          installs,
          namespace: metadata.namespace,
          categories: metadata.categories,
          tags: metadata.tags,
        });
        await saveIndex(sortIndex(nextIndex));

        if (isJsonEnabled(options)) {
          stopSpinner();
          printJson({
            ok: true,
            command: "add",
            data: {
              name: skillName,
              source: { type: "url", url: input },
              scope,
              installs,
            },
          });
          return;
        }

        printSuccess(skillName);
        printInfo(`\nAdded skill from ${input}.`);
      } catch (error) {
        handleCommandError(options, "add", error);
      }
    });
}

async function handlePromptFallback(input: string, options: { json?: boolean }): Promise<void> {
  const prompt = await buildIngestPrompt(input);

  if (isJsonEnabled(options)) {
    printJson({
      ok: false,
      command: "add",
      error: {
        message: "Input does not appear to be a valid skill.",
      },
      data: {
        ingest: true,
        prompt,
        next: "skillbox add --ingest <json>",
      },
    });
    return;
  }

  printInfo("This URL does not appear to be a valid skill.");
  printInfo("Use an agent to extract and return JSON using the schema below.");
  printInfo("Then run: skillbox add --ingest <json>");
  printInfo("");
  printInfo(prompt);
}

async function handleIngest(
  filePath: string,
  options: { json?: boolean; global?: boolean; agents?: string }
): Promise<void> {
  try {
    const ingestPath = await resolveIngestPath(filePath);
    const ingest = await readIngestFile(ingestPath);
    const skillMarkdown = buildSkillMarkdown(ingest);
    const metadata = buildIngestMetadata(ingest, skillMarkdown);

    await writeIngestedSkillFiles(ingest, skillMarkdown, metadata);

    const index = await loadIndex();
    const updated = upsertSkill(index, {
      name: metadata.name,
      source: metadata.source,
      checksum: metadata.checksum,
      updatedAt: metadata.updatedAt,
      namespace: metadata.namespace,
      categories: metadata.categories,
      tags: metadata.tags,
    });

    const runtimeInstall = await installSkillToRuntime(metadata.name, options);
    for (const warning of runtimeInstall.warnings) {
      printInfo(warning);
    }

    const nextIndex = upsertSkill(updated, {
      name: metadata.name,
      source: metadata.source,
      checksum: metadata.checksum,
      updatedAt: metadata.updatedAt,
      installs: runtimeInstall.installs,
      namespace: metadata.namespace,
      categories: metadata.categories,
      tags: metadata.tags,
    });
    await saveIndex(sortIndex(nextIndex));

    if (isJsonEnabled(options)) {
      printJson({
        ok: true,
        command: "add",
        data: {
          name: metadata.name,
          source: metadata.source,
          scope: runtimeInstall.scope,
          installs: runtimeInstall.installs,
          ingest: true,
        },
      });
      return;
    }

    printInfo(`Skill Added: ${metadata.name}`);
    printInfo("");
    printInfo("Source: convert");
    printInfo(`  ${metadata.source.value ?? "(unknown)"}`);

    if (runtimeInstall.installs.length > 0) {
      printInfo("");
      printInfo("Installed to:");
      for (const install of runtimeInstall.installs) {
        const scopeLabel = install.scope === "project" ? `project:${install.projectRoot}` : "user";
        printInfo(`  ✓ ${scopeLabel}/${install.agent}`);
      }
    } else {
      printInfo("");
      printInfo("No agent targets were updated.");
    }
  } catch (error) {
    handleCommandError(options, "add", error);
  }
}
