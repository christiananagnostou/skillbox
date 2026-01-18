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
      const grouped = groupByProject(skills);

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "list",
          data: {
            group: options.group ?? null,
            skills,
            projects: options.group === "project" ? grouped : undefined
          }
        });
        return;
      }

      if (options.group === "project") {
        printInfo(`Projects: ${grouped.length}`);
        for (const project of grouped) {
          printInfo(`- ${project.root}`);
          for (const skillName of project.skills) {
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
