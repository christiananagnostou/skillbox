import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { handleCommandError } from "../lib/command.js";
import { discoverSkills } from "../lib/discovery.js";
import { getSystemAgentPaths, getUserAgentPaths } from "../lib/agents.js";

export const registerImport = (program: Command): void => {
  program
    .command("import")
    .argument("[path]", "Path to skill directory")
    .option("--global", "Import skills from user agent folders")
    .option("--system", "Import skills from system agent folders")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
        if (!inputPath && !options.global && !options.system) {
          throw new Error("Provide a path or use --global/--system.");
        }

        if (options.global || options.system) {
          const summary = await importGlobalSkills({
            includeUser: Boolean(options.global),
            includeSystem: Boolean(options.system),
          });
          if (isJsonEnabled(options)) {
            printJson({
              ok: true,
              command: "import",
              data: summary,
            });
            return;
          }
          printInfo(`Imported ${summary.imported.length} skill(s).`);
          return;
        }

        const resolved = path.resolve(inputPath);
        const skillPath = path.join(resolved, "SKILL.md");
        const markdown = await fs.readFile(skillPath, "utf8");
        const parsed = parseSkillMarkdown(markdown);
        const metadata = buildMetadata(parsed, { type: "local" });

        if (!parsed.description) {
          throw new Error("Skill frontmatter missing description.");
        }

        await ensureSkillsDir();
        await writeSkillFiles(metadata.name, markdown, metadata);

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name: metadata.name,
          source: { type: "local" },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
        });
        await saveIndex(sortIndex(updated));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "import",
            data: {
              name: metadata.name,
              path: resolved,
            },
          });
          return;
        }

        printInfo(`Imported skill: ${metadata.name}`);
      } catch (error) {
        handleCommandError(options, "import", error);
      }
    });
};

type GlobalImportSummary = {
  imported: string[];
  skipped: string[];
};

const importGlobalSkills = async (options: {
  includeUser: boolean;
  includeSystem: boolean;
}): Promise<GlobalImportSummary> => {
  const projectRoot = process.cwd();
  const paths = [
    ...(options.includeUser ? getUserAgentPaths(projectRoot) : []),
    ...(options.includeSystem ? getSystemAgentPaths(projectRoot) : []),
  ];

  const discovered = await discoverSkills(paths);
  const index = await loadIndex();
  const seen = new Set(index.skills.map((skill) => skill.name));

  const imported: string[] = [];
  const skipped: string[] = [];

  for (const skill of discovered) {
    if (seen.has(skill.name)) {
      skipped.push(skill.name);
      continue;
    }

    const markdown = await fs.readFile(skill.skillFile, "utf8");
    const parsed = parseSkillMarkdown(markdown);
    const metadata = buildMetadata(parsed, { type: "local" });

    if (!parsed.description) {
      skipped.push(skill.name);
      continue;
    }

    await ensureSkillsDir();
    await writeSkillFiles(metadata.name, markdown, metadata);

    const next = upsertSkill(index, {
      name: metadata.name,
      source: { type: "local" },
      checksum: parsed.checksum,
      updatedAt: metadata.updatedAt,
      installs: [
        {
          scope: options.includeSystem ? "system" : "user",
          agent: "unknown",
          path: skill.skillDir,
        },
      ],
    });
    index.skills = next.skills;
    imported.push(metadata.name);
  }

  await saveIndex(sortIndex(index));

  return {
    imported: imported.sort(),
    skipped: skipped.sort(),
  };
};
