import type { Command } from "commander";
import { handleCommandError } from "../lib/command.js";
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
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { buildMetadata, inferNameFromUrl, parseSkillMarkdown } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { handleRepoInstall, isRepoUrl } from "./add-repo.js";

export function registerAdd(program: Command): void {
  program
    .command("add")
    .argument("[input]", "Skill URL or repo")
    .option("--name <name>", "Override skill name")
    .option("--global", "Install to user scope")
    .option("--agents <list>", "Comma-separated agent list")
    .option("--skill <skill>", "Skill name to install", collect)
    .option("--list", "List skills in repo without installing")
    .option("--ingest <file>", "Ingest agent conversion JSON")
    .option("--json", "JSON output")
    .action(async (input, options) => {
      try {
        if (options.ingest) {
          await handleIngest(options.ingest, options);
          return;
        }

        if (!input) {
          throw new Error("Provide a URL or repo, or use --ingest.");
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

        const skillMarkdown = await fetchText(input);
        const parsed = parseSkillMarkdown(skillMarkdown);
        const inferred = inferNameFromUrl(input);
        const skillName = options.name ?? inferred ?? parsed.name;

        if (!skillName || !parsed.description || (!parsed.name && !options.name)) {
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

        const runtimeInstall = await installSkillToRuntime(skillName, options);
        for (const warning of runtimeInstall.warnings) {
          printInfo(warning);
        }

        const nextIndex = upsertSkill(updated, {
          name: skillName,
          source: { type: "url", url: input },
          checksum: parsed.checksum,
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
              name: skillName,
              source: { type: "url", url: input },
              scope: runtimeInstall.scope,
              installs: runtimeInstall.installs,
            },
          });
          return;
        }

        printInfo(`Skill Added: ${skillName}`);
        printInfo("");
        printInfo("Source: url");
        printInfo(`  ${input}`);

        if (runtimeInstall.installs.length > 0) {
          printInfo("");
          printInfo("Installed to:");
          for (const install of runtimeInstall.installs) {
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

async function handlePromptFallback(input: string, options: { json?: boolean }): Promise<void> {
  const prompt = buildIngestPrompt(input);

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
  const ingest = await readIngestFile(filePath);
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
}
