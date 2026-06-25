import chalk from "chalk";
import type { Command } from "commander";
import os from "node:os";
import path from "node:path";
import terminalLink from "terminal-link";
import { allAgents, type AgentId } from "../lib/agents.js";
import { discoverGlobalSkills } from "../lib/global-skills.js";
import { loadIndex } from "../lib/index.js";
import { isProjectInstall, isUserInstall } from "../lib/installs.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { resolveRuntime } from "../lib/runtime.js";
import { readSkillDirEntries } from "../lib/skill-store.js";
import { groupAndSort, sortByName } from "../lib/source-grouping.js";
import type { SkillInstall } from "../lib/types.js";

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

function getSkillPath(skill: SkillEntry): string | null {
  if (!skill.installs || skill.installs.length === 0) return null;
  return skill.installs[0].path;
}

async function enrichWithSubcommands(skills: SkillEntry[]): Promise<SkillWithSubcommands[]> {
  const results: SkillWithSubcommands[] = [];

  for (const skill of skills) {
    const skillPath = getSkillPath(skill);
    const { subcommands } = skillPath ? await readSkillDirEntries(skillPath) : { subcommands: [] };
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
    const hasProjectInstall = skill.installs?.some(isProjectInstall);
    const hasUserInstall = skill.installs?.some(isUserInstall);

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
const LIST_SOURCE_ORDER = ["local", "git", "url", "convert"];

function groupBySourceType(
  skills: SkillWithSubcommands[]
): Array<{ source: string; skills: SkillWithSubcommands[] }> {
  const grouped = groupAndSort(skills, (skill) => skill.source.type, LIST_SOURCE_ORDER, sortByName);

  return grouped.map(({ key, items }) => ({ source: key, skills: items }));
}

function getProjectRoots(skill: SkillWithSubcommands): string[] {
  const roots = (skill.installs ?? [])
    .filter(isProjectInstall)
    .map((install) => install.projectRoot);
  return Array.from(new Set(roots));
}

function getSkillAgents(skill: SkillEntry): string[] {
  if (!skill.installs) return [];
  const agents = new Set<string>();
  for (const install of skill.installs) {
    if (install.agent) agents.add(install.agent);
  }
  return Array.from(agents).sort();
}

function getModalAgentSet(agentsBySkill: Map<SkillEntry, string[]>): string[] | null {
  const counts = new Map<string, { agents: string[]; count: number }>();
  for (const agents of agentsBySkill.values()) {
    if (agents.length === 0) continue;
    const key = agents.join(",");
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { agents, count: 1 });
    }
  }
  if (counts.size === 0) return null;
  // Tie-break: prefer the smaller set so fewer skills get tagged as divergent.
  // Final tie: alphabetical for determinism.
  const sorted = Array.from(counts.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.agents.length !== b.agents.length) return a.agents.length - b.agents.length;
    return a.agents.join(",").localeCompare(b.agents.join(","));
  });
  return sorted[0].agents;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function formatAgentDivergence(skillAgents: string[], modalAgents: string[]): string | null {
  if (arraysEqual(skillAgents, modalAgents)) return null;
  if (skillAgents.length === 0) return "no agents";
  const isStrictSubset =
    skillAgents.length < modalAgents.length &&
    skillAgents.every((agent) => modalAgents.includes(agent));
  if (isStrictSubset) {
    return `${skillAgents.join(", ")} only`;
  }
  return skillAgents.join(", ");
}

function renderSkillLine(
  indent: string,
  skill: SkillWithSubcommands,
  divergence: string | null
): string {
  const base = `${indent}${linkSkillName(skill)}`;
  if (!divergence) return base;
  return `${base} ${chalk.dim(`[${divergence}]`)}`;
}

function tildify(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(`${home}/`)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}

function collectInstallDirsByAgent(
  skills: SkillEntry[],
  predicate: (install: SkillInstall) => boolean
): Map<string, string> {
  const dirsByAgent = new Map<string, string>();
  for (const skill of skills) {
    if (!skill.installs) continue;
    for (const install of skill.installs) {
      if (!predicate(install)) continue;
      if (dirsByAgent.has(install.agent)) continue;
      dirsByAgent.set(install.agent, path.dirname(install.path));
    }
  }
  return dirsByAgent;
}

function toSortedAgentRoots(
  dirsByAgent: Map<string, string>,
  formatDir: (absoluteDir: string) => string
): Array<{ agent: string; root: string }> {
  const orderIndex = new Map(allAgents.map((agent, i) => [agent as string, i]));
  return Array.from(dirsByAgent.entries())
    .sort(([a], [b]) => (orderIndex.get(a) ?? Infinity) - (orderIndex.get(b) ?? Infinity))
    .map(([agent, dir]) => ({ agent, root: formatDir(dir) }));
}

function getUserAgentRoots(skills: SkillEntry[]): Array<{ agent: string; root: string }> {
  return toSortedAgentRoots(collectInstallDirsByAgent(skills, isUserInstall), tildify);
}

function getProjectAgentRoots(
  skills: SkillEntry[],
  projectRoot: string
): Array<{ agent: string; root: string }> {
  return toSortedAgentRoots(
    collectInstallDirsByAgent(skills, isProjectInstall),
    (dir) => path.relative(projectRoot, dir) || "."
  );
}

function printAgentInstallTable(
  agentRoots: Array<{ agent: string; root: string }>,
  indent: string
): void {
  if (agentRoots.length === 0) return;
  const maxAgentLen = Math.max(...agentRoots.map((entry) => entry.agent.length));
  for (const { agent, root } of agentRoots) {
    printInfo(`${indent}${chalk.dim(`${agent.padEnd(maxAgentLen)} → ${root}`)}`);
  }
}

function printScopeGroup(group: ScopeGroup, showAgents: boolean): void {
  const label = group.scope === "global" ? "Global Skills" : "Project Skills";
  const totalCount = group.sourceGroups.reduce((sum, g) => sum + g.skills.length, 0);
  const allSkills = group.sourceGroups.flatMap((g) => g.skills);

  const agentsBySkill = new Map<SkillEntry, string[]>();
  if (showAgents) {
    for (const skill of allSkills) {
      agentsBySkill.set(skill, getSkillAgents(skill));
    }
  }
  const modalAgents = showAgents ? getModalAgentSet(agentsBySkill) : null;
  const divergenceFor = (skill: SkillEntry): string | null => {
    if (!modalAgents) return null;
    return formatAgentDivergence(agentsBySkill.get(skill) ?? [], modalAgents);
  };

  printInfo(`${label} (${totalCount})`);

  if (group.scope === "project" && group.projectGroups) {
    for (const projectGroup of group.projectGroups) {
      printInfo("");
      printInfo(projectGroup.projectRoot);

      if (showAgents) {
        const projectSkills = projectGroup.sourceGroups.flatMap((g) => g.skills);
        printAgentInstallTable(getProjectAgentRoots(projectSkills, projectGroup.projectRoot), "  ");
      }

      for (const sourceGroup of projectGroup.sourceGroups) {
        printInfo("");
        printInfo(`  ${sourceGroup.source}`);

        for (const skill of sourceGroup.skills) {
          printInfo(renderSkillLine("    ", skill, divergenceFor(skill)));

          if (skill.subcommands.length > 0) {
            printInfo(`      → ${skill.subcommands.join(", ")}`);
          }
        }
      }
    }
    return;
  }

  if (showAgents) {
    printAgentInstallTable(getUserAgentRoots(allSkills), "  ");
  }

  for (const sourceGroup of group.sourceGroups) {
    printInfo("");
    printInfo(`${sourceGroup.source}`);

    for (const skill of sourceGroup.skills) {
      printInfo(renderSkillLine("  ", skill, divergenceFor(skill)));

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

function filterUserScope(skills: SkillEntry[]): SkillEntry[] {
  return skills
    .filter((skill) => skill.installs?.some(isUserInstall) ?? !skill.installs?.length)
    .map((skill) => ({
      ...skill,
      installs: skill.installs?.filter(isUserInstall),
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

      // Filter indexed skills by specified agents if --agents flag is used
      const indexedSkills = options.agents
        ? filterByAgents(index.skills, runtime.agentList)
        : index.skills;
      const scopedSkills = options.global ? filterUserScope(indexedSkills) : indexedSkills;
      const mergedSkills: SkillEntry[] = [...scopedSkills, ...globalSkills];

      const enrichedSkills = await enrichWithSubcommands(mergedSkills);

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

      const showAgents = !options.agents;
      for (let i = 0; i < scopeGroups.length; i++) {
        if (i > 0) printInfo("");
        printScopeGroup(scopeGroups[i], showAgents);
      }
    });
}
