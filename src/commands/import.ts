import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { handleCommandError } from "../lib/command.js";
import { discoverSkills } from "../lib/discovery.js";
import { getUserAgentPaths } from "../lib/agents.js";

export const registerImport = (program: Command): void => {
  program
    .command("import")
    .argument("[path]", "Path to skill directory")
    .option("--global", "Import skills from user agent folders")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
        if (!inputPath && !options.global) {
          throw new Error("Provide a path or use --global.");
        }

        if (options.global) {
          const summary = await importGlobalSkills();
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

const importGlobalSkills = async (): Promise<GlobalImportSummary> => {
  const projectRoot = process.cwd();
  const paths = getUserAgentPaths(projectRoot);

  const discovered = await discoverSkills(paths);
  const index = await loadIndex();
  const seen = new Set(index.skills.map((skill) => skill.name));

  const imported = new Set<string>();
  const skipped = new Set<string>();

  for (const skill of discovered) {
    if (seen.has(skill.name)) {
      skipped.add(skill.name);
      continue;
    }

    const markdown = await fs.readFile(skill.skillFile, "utf8");
    const parsed = parseSkillMarkdown(markdown);
    const metadata = buildMetadata(parsed, { type: "local" });

    if (!parsed.description) {
      skipped.add(skill.name);
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
          scope: "user",
          agent: "unknown",
          path: skill.skillDir,
        },
      ],
    });
    index.skills = next.skills;
    imported.add(metadata.name);
  }

  await saveIndex(sortIndex(index));

  return {
    imported: Array.from(imported).sort(),
    skipped: Array.from(skipped).sort(),
  };
};
