import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { parseSkillMarkdown, buildMetadata } from "../lib/skill-parser.js";
import { ensureSkillsDir, writeSkillFiles } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { handleCommandError } from "../lib/command.js";
import { discoverSkills } from "../lib/discovery.js";
import type { AgentId } from "../lib/agents.js";
import { getUserPathsForAgents } from "../lib/agents.js";
import { resolveRuntime } from "../lib/runtime.js";

export const registerImport = (program: Command): void => {
  program
    .command("import")
    .argument("[path]", "Path to skill directory")
    .option("--global", "Import skills from user agent folders")
    .option("--agents <agents>", "Comma-separated list of agents to scan")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
        if (!inputPath && !options.global) {
          throw new Error("Provide a path or use --global.");
        }

        if (options.global) {
          const runtime = await resolveRuntime(options);
          const summary = await importGlobalSkills(runtime.agentList);
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

type DiscoveredWithAgent = {
  name: string;
  skillDir: string;
  skillFile: string;
  agent: AgentId;
};

const importGlobalSkills = async (agents: AgentId[]): Promise<GlobalImportSummary> => {
  const projectRoot = process.cwd();
  const agentPaths = getUserPathsForAgents(projectRoot, agents);

  const discovered: DiscoveredWithAgent[] = [];
  const seenSkills = new Set<string>();

  for (const { agent, path: agentPath } of agentPaths) {
    const skills = await discoverSkills([agentPath]);
    for (const skill of skills) {
      if (seenSkills.has(skill.name)) {
        continue;
      }
      seenSkills.add(skill.name);
      discovered.push({ ...skill, agent });
    }
  }

  const index = await loadIndex();
  const indexed = new Set(index.skills.map((skill) => skill.name));

  const imported = new Set<string>();
  const skipped = new Set<string>();

  for (const skill of discovered) {
    if (indexed.has(skill.name)) {
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
          agent: skill.agent,
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
