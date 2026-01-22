import chalk from "chalk";
import type { Command } from "commander";
import fs from "node:fs/promises";
import terminalLink from "terminal-link";
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
  source: { type: string; url?: string; repo?: string; path?: string };
  installs?: SkillInstall[];
  namespace?: string;
  categories?: string[];
  tags?: string[];
};

function getSkillUrl(skill: SkillEntry): string | undefined {
  if (skill.source.type === "url" && skill.source.url) {
    return skill.source.url;
  }
  if (skill.source.type === "git" && skill.source.repo) {
    const repo = skill.source.repo;
    // If already a full URL, use it directly
    if (repo.startsWith("http://") || repo.startsWith("https://")) {
      return repo;
    }
    // Convert shorthand (user/repo) to full GitHub URL
    return `https://github.com/${repo}`;
  }
  return undefined;
}

function linkSkillName(skill: SkillEntry): string {
  const url = getSkillUrl(skill);
  if (url && terminalLink.isSupported) {
    const linkIcon = terminalLink("‹↗›", url);
    return `${skill.name} ${chalk.dim(linkIcon)}`;
  }
  return skill.name;
}

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
  projectGroups?: Array<{
    projectRoot: string;
    sourceGroups: Array<{
      source: string;
      skills: SkillWithSubcommands[];
    }>;
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
    const projectRoots = new Map<string, SkillWithSubcommands[]>();

    for (const skill of projectSkills) {
      const roots = getProjectRoots(skill);
      if (roots.length === 0) {
        continue;
      }
      for (const root of roots) {
        const existing = projectRoots.get(root) ?? [];
        existing.push(skill);
        projectRoots.set(root, existing);
      }
    }

    const projectGroups = Array.from(projectRoots.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([projectRoot, skillsForProject]) => ({
        projectRoot,
        sourceGroups: groupBySourceType(skillsForProject),
      }));

    result.push({
      scope: "project",
      sourceGroups: groupBySourceType(projectSkills),
      projectGroups,
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

function getProjectRoots(skill: SkillWithSubcommands): string[] {
  const roots = (skill.installs ?? [])
    .filter((install) => install.scope === "project")
    .map((install) => install.projectRoot)
    .filter((root): root is string => Boolean(root));
  return Array.from(new Set(roots));
}

function printScopeGroup(group: ScopeGroup): void {
  const label = group.scope === "global" ? "Global Skills" : "Project Skills";
  const totalCount = group.sourceGroups.reduce((sum, g) => sum + g.skills.length, 0);

  printInfo(`${label} (${totalCount})`);

  if (group.scope === "project" && group.projectGroups) {
    for (const projectGroup of group.projectGroups) {
      printInfo("");
      printInfo(projectGroup.projectRoot);

      for (const sourceGroup of projectGroup.sourceGroups) {
        printInfo(`  ${sourceGroup.source}`);

        for (const skill of sourceGroup.skills) {
          printInfo(`    ${linkSkillName(skill)}`);

          if (skill.subcommands.length > 0) {
            printInfo(`      → ${skill.subcommands.join(", ")}`);
          }
        }
      }
    }
    return;
  }

  for (const sourceGroup of group.sourceGroups) {
    printInfo("");
    printInfo(`${sourceGroup.source}`);

    for (const skill of sourceGroup.skills) {
      printInfo(`  ${linkSkillName(skill)}`);

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

function filterByAgents(skills: SkillEntry[], agents: string[]): SkillEntry[] {
  const agentSet = new Set(agents);
  return skills.filter((skill) =>
    skill.installs?.some((install) => install.agent && agentSet.has(install.agent))
  );
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

      // Filter indexed skills by specified agents if --agents flag is used
      const indexedSkills = options.agents
        ? filterByAgents(index.skills, runtime.agentList)
        : index.skills;
      const allSkills: SkillEntry[] = [...indexedSkills, ...globalSkills];

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
        if (options.agents) {
          printInfo(`No skills found for agent(s): ${runtime.agentList.join(", ")}`);
        } else {
          printInfo("No skills installed.");
        }
        return;
      }

      for (let i = 0; i < scopeGroups.length; i++) {
        if (i > 0) printInfo("");
        printScopeGroup(scopeGroups[i]);
      }
    });
}
