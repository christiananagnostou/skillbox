import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson, printGroupList } from "../lib/output.js";
import { loadIndex } from "../lib/index.js";
import { groupNamesByKey } from "../lib/grouping.js";
import { discoverGlobalSkills } from "../lib/global-skills.js";

export const registerList = (program: Command): void => {
  program
    .command("list")
    .option("--group <group>", "Group by category, namespace, source, project")
    .option("--json", "JSON output")
    .action(async (options) => {
      const index = await loadIndex();
      const globalSkills = await listGlobalSkills(index.skills);
      const skills = [...index.skills, ...globalSkills];
      const groupedProjects = groupByProject(skills);
      const groupedSources = groupBySource(skills);
      const groupedNamespaces = groupByNamespace(skills);
      const groupedCategories = groupByCategory(skills);

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "list",
          data: {
            group: options.group ?? null,
            skills,
            projects: options.group === "project" ? groupedProjects : undefined,
            sources: options.group === "source" ? groupedSources : undefined,
            namespaces: options.group === "namespace" ? groupedNamespaces : undefined,
            categories: options.group === "category" ? groupedCategories : undefined,
          },
        });
        return;
      }

      if (options.group === "project") {
        printGroupList(
          "Projects",
          groupedProjects.map((project) => ({ key: project.root, items: project.skills }))
        );
        return;
      }

      if (options.group === "source") {
        printGroupList(
          "Sources",
          groupedSources.map((source) => ({ key: source.source, items: source.skills }))
        );
        return;
      }

      if (options.group === "namespace") {
        printGroupList(
          "Namespaces",
          groupedNamespaces.map((namespace) => ({
            key: namespace.namespace,
            items: namespace.skills,
          }))
        );
        return;
      }

      if (options.group === "category") {
        printGroupList(
          "Categories",
          groupedCategories.map((category) => ({ key: category.category, items: category.skills }))
        );
        return;
      }

      printInfo(`Skills: ${skills.length}`);
      for (const skill of skills) {
        const source = skill.source.type;
        const namespace = skill.namespace ? ` (${skill.namespace})` : "";
        printInfo(`- ${skill.name}${namespace} [${source}]`);
      }
    });
};

const groupByProject = (
  skills: Array<{ name: string; installs?: Array<{ projectRoot?: string; scope: string }> }>
) => {
  const grouped = groupNamesByKey(
    skills,
    (skill) => skill.name,
    (skill) =>
      (skill.installs ?? [])
        .filter((install) => install.scope === "project" && install.projectRoot)
        .map((install) => install.projectRoot as string)
  );
  return grouped.map((group) => ({ root: group.key, skills: group.skills }));
};

const listGlobalSkills = async (
  existing: Array<{ name: string }>
): Promise<
  Array<{
    name: string;
    source: { type: "local" };
    installs: Array<{ scope: "user"; agent: string; path: string }>;
    namespace?: string;
    categories?: string[];
    tags?: string[];
  }>
> => {
  const projectRoot = process.cwd();
  const seen = new Set(existing.map((skill) => skill.name));
  const discovered = await discoverGlobalSkills(projectRoot);
  return discovered
    .filter((skill) => !seen.has(skill.name))
    .map((skill) => ({
      name: skill.name,
      source: { type: "local" },
      installs: skill.installs,
      namespace: undefined,
      categories: undefined,
      tags: undefined,
    }));
};

const groupBySource = (skills: Array<{ name: string; source: { type: string } }>) => {
  const grouped = groupNamesByKey(
    skills,
    (skill) => skill.name,
    (skill) => [skill.source.type]
  );
  return grouped.map((group) => ({ source: group.key, skills: group.skills }));
};

const groupByNamespace = (skills: Array<{ name: string; namespace?: string }>) => {
  const grouped = groupNamesByKey(
    skills,
    (skill) => skill.name,
    (skill) => [skill.namespace ?? "(none)"]
  );
  return grouped
    .map((group) => ({ namespace: group.key, skills: group.skills }))
    .sort((a, b) => {
      if (a.namespace === "(none)") {
        return 1;
      }
      if (b.namespace === "(none)") {
        return -1;
      }
      return a.namespace.localeCompare(b.namespace);
    });
};

const groupByCategory = (skills: Array<{ name: string; categories?: string[] }>) => {
  const grouped = groupNamesByKey(
    skills,
    (skill) => skill.name,
    (skill) => skill.categories ?? ["(uncategorized)"]
  );
  return grouped
    .map((group) => ({ category: group.key, skills: group.skills }))
    .sort((a, b) => {
      if (a.category === "(uncategorized)") {
        return 1;
      }
      if (b.category === "(uncategorized)") {
        return -1;
      }
      return a.category.localeCompare(b.category);
    });
};
