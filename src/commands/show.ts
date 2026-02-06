import chalk from "chalk";
import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { handleCommandError } from "../lib/command.js";
import { loadIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { readSkillMetadata, skillDir } from "../lib/skill-store.js";

async function detectSubcommands(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".md") && e !== "SKILL.md")
      .map((e) => e.replace(/\.md$/, ""))
      .sort();
  } catch {
    return [];
  }
}

async function listExtraFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e !== "SKILL.md" && e !== "skill.json").sort();
  } catch {
    return [];
  }
}

export function registerShow(program: Command): void {
  program
    .command("show")
    .argument("<name>", "Skill name")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const indexed = index.skills.find((s) => s.name === name);

        if (!indexed) {
          throw new Error(`Skill not found: ${name}`);
        }

        const dir = skillDir(name);
        const skillMdPath = path.join(dir, "SKILL.md");

        let content: string;
        try {
          content = await fs.readFile(skillMdPath, "utf8");
        } catch {
          throw new Error(`Skill files missing for: ${name}`);
        }

        const metadata = await readSkillMetadata(name);
        const subcommands = await detectSubcommands(dir);
        const extraFiles = await listExtraFiles(dir);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "show",
            data: {
              name,
              description: metadata.description,
              source: indexed.source,
              checksum: indexed.checksum,
              updatedAt: indexed.updatedAt,
              installs: indexed.installs ?? [],
              subcommands,
              extraFiles,
              content,
            },
          });
          return;
        }

        // Header
        printInfo(chalk.bold(name));
        if (metadata.description) {
          printInfo(chalk.dim(metadata.description));
        }
        printInfo("");

        // Metadata
        printInfo(`Source: ${formatSource(indexed.source)}`);
        printInfo(`Updated: ${indexed.updatedAt}`);

        // Installs
        const installs = indexed.installs ?? [];
        if (installs.length > 0) {
          printInfo("");
          printInfo(`Installs (${installs.length})`);
          for (const install of installs) {
            const scope = install.scope === "project" ? `project: ${install.projectRoot}` : "user";
            printInfo(`  ${scope}/${install.agent}`);
          }
        }

        // Subcommands
        if (subcommands.length > 0) {
          printInfo("");
          printInfo(`Subcommands (${subcommands.length})`);
          for (const sub of subcommands) {
            printInfo(`  ${sub}`);
          }
        }

        // Content
        printInfo("");
        printInfo(chalk.dim("─".repeat(40)));
        printInfo(content.trim());
      } catch (error) {
        handleCommandError(options, "show", error);
      }
    });
}

function formatSource(source: {
  type: string;
  url?: string;
  repo?: string;
  path?: string;
}): string {
  if (source.type === "url" && source.url) return source.url;
  if (source.type === "git" && source.repo) {
    return source.path ? `${source.repo} (${source.path})` : source.repo;
  }
  return source.type;
}
