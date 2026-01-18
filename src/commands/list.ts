import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex } from "../lib/index.js";

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
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    for (const install of skill.installs ?? []) {
      if (install.scope !== "project" || !install.projectRoot) {
        continue;
      }
      const existing = map.get(install.projectRoot) ?? [];
      if (!existing.includes(skill.name)) {
        existing.push(skill.name);
        map.set(install.projectRoot, existing);
      }
    }
  }
  return Array.from(map.entries())
    .map(([root, skillNames]) => ({ root, skills: skillNames.sort() }))
    .sort((a, b) => a.root.localeCompare(b.root));
};

const groupBySource = (skills: Array<{ name: string; source: { type: string } }>) => {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const source = skill.source.type;
    const existing = map.get(source) ?? [];
    if (!existing.includes(skill.name)) {
      existing.push(skill.name);
      map.set(source, existing);
    }
  }
  return Array.from(map.entries())
    .map(([source, skillNames]) => ({ source, skills: skillNames.sort() }))
    .sort((a, b) => a.source.localeCompare(b.source));
};

const groupByNamespace = (skills: Array<{ name: string; namespace?: string }>) => {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const namespace = skill.namespace ?? "(none)";
    const existing = map.get(namespace) ?? [];
    if (!existing.includes(skill.name)) {
      existing.push(skill.name);
      map.set(namespace, existing);
    }
  }
  return Array.from(map.entries())
    .map(([namespace, skillNames]) => ({ namespace, skills: skillNames.sort() }))
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
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const categories = skill.categories ?? ["(uncategorized)"];
    for (const category of categories) {
      const existing = map.get(category) ?? [];
      if (!existing.includes(skill.name)) {
        existing.push(skill.name);
        map.set(category, existing);
      }
    }
  }
  return Array.from(map.entries())
    .map(([category, skillNames]) => ({ category, skills: skillNames.sort() }))
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
