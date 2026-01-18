import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex } from "../lib/index.js";
import { groupNamesByKey } from "../lib/grouping.js";

export const registerList = (program: Command): void => {
  program
    .command("list")
    .option("--group <group>", "Group by category, namespace, source, project")
    .option("--json", "JSON output")
    .action(async (options) => {
      const index = await loadIndex();
      const skills = index.skills;
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
            categories: options.group === "category" ? groupedCategories : undefined
          }
        });
        return;
      }

      if (options.group === "project") {
        printInfo(`Projects: ${groupedProjects.length}`);
        for (const project of groupedProjects) {
          printInfo(`- ${project.root}`);
          for (const skillName of project.skills) {
            printInfo(`  - ${skillName}`);
          }
        }
        return;
      }

      if (options.group === "source") {
        printInfo(`Sources: ${groupedSources.length}`);
        for (const source of groupedSources) {
          printInfo(`- ${source.source}`);
          for (const skillName of source.skills) {
            printInfo(`  - ${skillName}`);
          }
        }
        return;
      }

      if (options.group === "namespace") {
        printInfo(`Namespaces: ${groupedNamespaces.length}`);
        for (const namespace of groupedNamespaces) {
          printInfo(`- ${namespace.namespace}`);
          for (const skillName of namespace.skills) {
            printInfo(`  - ${skillName}`);
          }
        }
        return;
      }

      if (options.group === "category") {
        printInfo(`Categories: ${groupedCategories.length}`);
        for (const category of groupedCategories) {
          printInfo(`- ${category.category}`);
          for (const skillName of category.skills) {
            printInfo(`  - ${skillName}`);
          }
        }
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

const groupByProject = (skills: Array<{ name: string; installs?: Array<{ projectRoot?: string; scope: string }> }>) => {
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
