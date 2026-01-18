import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";

export const registerImport = (program: Command): void => {
  program
    .command("import")
    .argument("<path>", "Path to skill directory")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
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
          updatedAt: metadata.updatedAt
        });
        await saveIndex(sortIndex(updated));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "import",
            data: {
              name: metadata.name,
              path: resolved
            }
          });
          return;
        }

        printInfo(`Imported skill: ${metadata.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "import", error: { message } });
          return;
        }
        printError(message);
      }
    });
};
