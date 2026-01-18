import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { fetchText } from "../lib/fetcher.js";
import { inferNameFromUrl } from "../lib/skill-parser.js";
import { handleCommandError } from "../lib/command.js";

export const registerConvert = (program: Command): void => {
  program
    .command("convert")
    .argument("<url>", "Source URL to convert")
    .option("--name <name>", "Override skill name")
    .option("--output <dir>", "Output directory")
    .option("--agent", "Delegate conversion to agent")
    .option("--json", "JSON output")
    .action(async (url, options) => {
      try {
        const sourceText = await fetchText(url);
        const inferred = inferNameFromUrl(url);
        const skillName = options.name ?? inferred;

        if (!skillName) {
          throw new Error("Unable to infer skill name. Use --name to specify it.");
        }

        const outputDir = options.output
          ? path.resolve(options.output)
          : path.join(process.cwd(), "skillbox-convert", skillName);

        const description = "Draft skill generated from source content.";
        const draftMarkdown = `---\nname: ${skillName}\ndescription: ${description}\n---\n\n# ${skillName}\n\n## Source\n- See source.txt for the raw content.\n\n## When to use\n- TODO\n\n## Instructions\n- TODO\n`;

        const metadata = {
          name: skillName,
          version: "0.1.0",
          description,
          entry: "SKILL.md",
          source: { type: "url", url },
          checksum: "draft",
          updatedAt: new Date().toISOString()
        };

        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(path.join(outputDir, "source.txt"), sourceText, "utf8");
        await fs.writeFile(path.join(outputDir, "SKILL.md"), draftMarkdown, "utf8");
        await fs.writeFile(path.join(outputDir, "skill.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "convert",
            data: {
              url,
              name: skillName,
              outputDir,
              agent: Boolean(options.agent),
              sourceLength: sourceText.length
            }
          });
          return;
        }

        printInfo(`Draft created: ${outputDir}`);
        if (options.agent) {
          printInfo("Agent mode enabled. Use the source.txt content to refine SKILL.md.");
        }
      } catch (error) {
        handleCommandError(options, "convert", error);
      }
    });
};
