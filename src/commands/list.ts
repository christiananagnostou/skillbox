import type { Command } from "commander";
import fs from "node:fs/promises";
import type { AgentId } from "../lib/agents.js";
import { discoverGlobalSkills } from "../lib/global-skills.js";
import { loadIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { resolveRuntime } from "../lib/runtime.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";

type SkillInstall = {
  scope: string;
  agent?: string;
  path: string;
  projectRoot?: string;
};

type SkillEntry = {
  name: string;
  source: { type: string };
  installs?: SkillInstall[];
  namespace?: string;
  categories?: string[];
  tags?: string[];
};

type SkillWithSubcommands = SkillEntry & {
  subcommands: string[];
};

async function detectSubcommands(skillPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(skillPath);
    const subcommands: string[] = [];

    for (const entry of entries) {
      if (entry === "SKILL.md") continue;
      if (!entry.endsWith(".md")) continue;

      const name = entry.replace(/\.md$/, "");
      subcommands.push(name);
    }

    return subcommands.sort();
  } catch {
    return [];
  }
}

function getSkillPath(skill: SkillEntry): string | null {
  if (!skill.installs || skill.installs.length === 0) return null;
  return skill.installs[0].path;
}

async function enrichWithSubcommands(skills: SkillEntry[]): Promise<SkillWithSubcommands[]> {
  const results: SkillWithSubcommands[] = [];

  for (const skill of skills) {
    const skillPath = getSkillPath(skill);
    const subcommands = skillPath ? await detectSubcommands(skillPath) : [];
    results.push({ ...skill, subcommands });
  }

  return results;
}

type ScopeGroup = {
  scope: "global" | "project";
  sourceGroups: Array<{
    source: string;
    skills: SkillWithSubcommands[];
  }>;
};

function groupByScope(skills: SkillWithSubcommands[]): ScopeGroup[] {
  const globalSkills: SkillWithSubcommands[] = [];
  const projectSkills: SkillWithSubcommands[] = [];

  for (const skill of skills) {
    const hasProjectInstall = skill.installs?.some((i) => i.scope === "project");
    const hasUserInstall = skill.installs?.some((i) => i.scope === "user");

    // A skill can be in both - for now, categorize by where it's installed
    if (hasProjectInstall) {
      projectSkills.push(skill);
    }
    if (hasUserInstall || (!hasProjectInstall && !hasUserInstall)) {
      globalSkills.push(skill);
    }
  }

  const result: ScopeGroup[] = [];

  if (globalSkills.length > 0) {
    result.push({
      scope: "global",
      sourceGroups: groupBySourceType(globalSkills),
    });
  }

  if (projectSkills.length > 0) {
    result.push({
      scope: "project",
      sourceGroups: groupBySourceType(projectSkills),
    });
  }

  return result;
}

// Sort sources: local first, then git, then url (for list command)
const LIST_SOURCE_ORDER = ["local", "git", "url"];

function groupBySourceType(
  skills: SkillWithSubcommands[]
): Array<{ source: string; skills: SkillWithSubcommands[] }> {
  const grouped = groupAndSort(skills, (skill) => skill.source.type, LIST_SOURCE_ORDER, sortByName);

  return grouped.map(({ key, items }) => ({ source: key, skills: items }));
}

function printScopeGroup(group: ScopeGroup): void {
  const label = group.scope === "global" ? "Global Skills" : "Project Skills";
  const totalCount = group.sourceGroups.reduce((sum, g) => sum + g.skills.length, 0);

  printInfo(`${label} (${totalCount})`);

  for (const sourceGroup of group.sourceGroups) {
    printInfo("");
    printInfo(`${sourceGroup.source}`);

    for (const skill of sourceGroup.skills) {
      printInfo(`  ${skill.name}`);

      if (skill.subcommands.length > 0) {
        printInfo(`    → ${skill.subcommands.join(", ")}`);
      }
    }
  }
}

async function listGlobalSkills(
  existing: Array<{ name: string }>,
  agents: AgentId[]
): Promise<SkillEntry[]> {
  const projectRoot = process.cwd();
  const seen = new Set(existing.map((skill) => skill.name));
  const discovered = await discoverGlobalSkills(projectRoot, agents);

  return discovered
    .filter((skill) => !seen.has(skill.name))
    .map((skill) => ({
      name: skill.name,
      source: { type: "local" as const },
      installs: skill.installs,
      namespace: undefined,
      categories: undefined,
      tags: undefined,
    }));
}

export function registerList(program: Command): void {
  program
    .command("list")
    .option("--json", "JSON output")
    .option("--global", "List user-scope skills only")
    .option("--agents <agents>", "Comma-separated list of agents to scan")
    .action(async (options) => {
      const runtime = await resolveRuntime(options);
      const index = await loadIndex();
      const globalSkills = await listGlobalSkills(index.skills, runtime.agentList);
      const allSkills: SkillEntry[] = [...index.skills, ...globalSkills];

      const enrichedSkills = await enrichWithSubcommands(allSkills);

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "list",
          data: {
            skills: enrichedSkills,
          },
        });
        return;
      }

      const scopeGroups = groupByScope(enrichedSkills);

      if (scopeGroups.length === 0) {
        printInfo("No skills installed.");
        return;
      }

      for (let i = 0; i < scopeGroups.length; i++) {
        if (i > 0) printInfo("");
        printScopeGroup(scopeGroups[i]);
      }
    });
}
