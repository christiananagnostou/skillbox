import type { Command } from "commander";
import path from "node:path";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadProjects, saveProjects, upsertProject } from "../lib/projects.js";
import { loadIndex } from "../lib/index.js";
import { copySkillToInstallPaths } from "../lib/sync.js";

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
      const skillIndex = await loadIndex();
      const resolved = path.resolve(inputPath);

      const project = projectsIndex.projects.find((entry) => entry.root === resolved);

      if (!project) {
        const message = `Project not registered: ${resolved}`;
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "project inspect", error: { message } });
          return;
        }
        printError(message);
        return;
      }

      const skills = new Set<string>();
      for (const skill of skillIndex.skills) {
        for (const install of skill.installs ?? []) {
          if (install.scope === "project" && install.projectRoot === resolved) {
            skills.add(skill.name);
          }
        }
      }

      const data = {
        root: project.root,
        agentPaths: project.agentPaths ?? {},
        skills: Array.from(skills).sort()
      };

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "project inspect",
          data
        });
        return;
      }

      printInfo(`Project: ${data.root}`);
      const agentEntries = Object.entries(data.agentPaths);
      if (agentEntries.length === 0) {
        printInfo("Agent paths: default");
      } else {
        printInfo("Agent paths:");
        for (const [agent, paths] of agentEntries) {
          printInfo(`- ${agent}: ${paths.join(", ")}`);
        }
      }
      if (data.skills.length === 0) {
        printInfo("Skills: none");
      } else {
        printInfo("Skills:");
        for (const skillName of data.skills) {
          printInfo(`- ${skillName}`);
        }
      }
    });

  project
    .command("sync")
    .argument("<path>", "Project path")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      const projectsIndex = await loadProjects();
      const skillIndex = await loadIndex();
      const resolved = path.resolve(inputPath);

      const skills = skillIndex.skills.filter((skill) =>
        (skill.installs ?? []).some(
          (install) => install.scope === "project" && install.projectRoot === resolved
        )
      );

      if (skills.length === 0) {
        const message = `No skills recorded for project: ${resolved}`;
        if (isJsonEnabled(options)) {
          printJson({ ok: false, command: "project sync", error: { message } });
          return;
        }
        printError(message);
        return;
      }

      const installPaths = new Map<string, string[]>();
      for (const skill of skills) {
        const paths = (skill.installs ?? [])
          .filter((install) => install.scope === "project" && install.projectRoot === resolved)
          .map((install) => install.path);
        installPaths.set(skill.name, paths);
      }

      for (const [skillName, paths] of installPaths.entries()) {
        await copySkillToInstallPaths(skillName, paths);
      }

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "project sync",
          data: {
            root: resolved,
            skills: Array.from(installPaths.keys()).sort()
          }
        });
        return;
      }

      printInfo(`Synced ${installPaths.size} skill(s) for ${resolved}`);
    });
};
