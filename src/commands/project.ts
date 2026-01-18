import type { Command } from "commander";
import path from "node:path";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadProjects, saveProjects, upsertProject } from "../lib/projects.js";
import { loadIndex } from "../lib/index.js";

const collect = (value: string, previous: string[] = []): string[] => {
  return [...previous, value];
};

const parseAgentPaths = (entries: string[]): Record<string, string[]> => {
  const overrides: Record<string, string[]> = {};
  for (const entry of entries) {
    const [agent, pathValue] = entry.split("=");
    if (!agent || !pathValue) {
      continue;
    }
    const existing = overrides[agent] ?? [];
    overrides[agent] = [...existing, pathValue];
  }
  return overrides;
};

export const registerProject = (program: Command): void => {
  const project = program.command("project").description("Manage projects");

  project
    .command("add")
    .argument("<path>", "Project path")
    .option("--agent-path <agentPath>", "Agent path override (agent=path)", collect)
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
        const resolved = path.resolve(inputPath);
        const index = await loadProjects();
        const updated = upsertProject(index, resolved);
        const overrides = parseAgentPaths(options.agentPath ?? []);

        const merged = {
          ...updated,
          projects: updated.projects.map((project) => {
            if (project.root !== resolved) {
              return project;
            }
            const nextPaths = { ...(project.agentPaths ?? {}) };
            for (const [agent, paths] of Object.entries(overrides)) {
              nextPaths[agent] = paths;
            }
            return { ...project, agentPaths: nextPaths };
          })
        };

        await saveProjects(merged);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "project add",
            data: {
              path: resolved,
              agentPaths: merged.projects.find((project) => project.root === resolved)?.agentPaths ?? {}
            }
          });
          return;
        }

        printInfo(`Project registered: ${resolved}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "project add", error: { message } });
          return;
        }
        printError(message);
      }
    });

  project
    .command("list")
    .option("--json", "JSON output")
    .action(async (options) => {
      const projectsIndex = await loadProjects();
      const skillIndex = await loadIndex();

      const projectSkills = new Map<string, string[]>();
      for (const skill of skillIndex.skills) {
        for (const install of skill.installs ?? []) {
          if (install.scope !== "project" || !install.projectRoot) {
            continue;
          }
          const existing = projectSkills.get(install.projectRoot) ?? [];
          if (!existing.includes(skill.name)) {
            existing.push(skill.name);
            projectSkills.set(install.projectRoot, existing);
          }
        }
      }

      const projects = projectsIndex.projects.map((project) => ({
        ...project,
        skills: projectSkills.get(project.root) ?? []
      }));

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "project list",
          data: {
            projects
          }
        });
        return;
      }

      printInfo(`Projects: ${projects.length}`);
      for (const entry of projects) {
        const skills = entry.skills ?? [];
        const label = skills.length > 0 ? ` (${skills.length} skills)` : "";
        printInfo(`- ${entry.root}${label}`);
        for (const skillName of skills) {
          printInfo(`  - ${skillName}`);
        }
      }
    });
};
