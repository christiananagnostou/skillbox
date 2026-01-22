import type { Command } from "commander";
import path from "node:path";
import type { AgentId } from "../lib/agents.js";
import { getUserPathsForAgents } from "../lib/agents.js";
import { handleCommandError } from "../lib/command.js";
import { discoverSkills } from "../lib/discovery.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { resolveRuntime } from "../lib/runtime.js";
import { importSkillFromDir } from "../lib/skill-store.js";

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

async function importGlobalSkills(agents: AgentId[]): Promise<GlobalImportSummary> {
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

    const data = await importSkillFromDir(skill.skillFile);
    if (!data) {
      skipped.add(skill.name);
      continue;
    }

    const next = upsertSkill(index, {
      name: data.name,
      source: { type: "local" },
      checksum: data.checksum,
      updatedAt: data.updatedAt,
      installs: [{ scope: "user", agent: skill.agent, path: skill.skillDir }],
    });
    index.skills = next.skills;
    imported.add(data.name);
  }

  await saveIndex(sortIndex(index));

  return {
    imported: Array.from(imported).sort(),
    skipped: Array.from(skipped).sort(),
  };
}

export function registerImport(program: Command): void {
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
            printJson({ ok: true, command: "import", data: summary });
            return;
          }
          printInfo(`Imported ${summary.imported.length} skill(s).`);
          return;
        }

        const resolved = path.resolve(inputPath);
        const skillPath = path.join(resolved, "SKILL.md");

        const data = await importSkillFromDir(skillPath);
        if (!data) {
          throw new Error("Skill frontmatter missing description.");
        }

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name: data.name,
          source: { type: "local" },
          checksum: data.checksum,
          updatedAt: data.updatedAt,
        });
        await saveIndex(sortIndex(updated));

        if (isJsonEnabled(options)) {
          printJson({ ok: true, command: "import", data: { name: data.name, path: resolved } });
          return;
        }

        printInfo(`Imported skill: ${data.name}`);
      } catch (error) {
        handleCommandError(options, "import", error);
      }
    });
}
