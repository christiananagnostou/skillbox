import type { Command } from "commander";
import path from "node:path";
import { handleCommandError } from "../lib/command.js";
import { collect } from "../lib/fs-utils.js";
import { loadIndex } from "../lib/index.js";
import { collectProjectSkills, getProjectInstallPaths, getProjectSkills } from "../lib/installs.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadProjects, saveProjects, upsertProject } from "../lib/projects.js";
import { copySkillToInstallPaths } from "../lib/sync.js";

function parseAgentPaths(entries: string[]): Record<string, string[]> {
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
}

export function registerProject(program: Command): void {
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
          projects: updated.projects.map((proj) => {
            if (proj.root !== resolved) {
              return proj;
            }
            const nextPaths = proj.agentPaths ? { ...proj.agentPaths } : {};
            for (const [agent, paths] of Object.entries(overrides)) {
              nextPaths[agent] = paths;
            }
            return { ...proj, agentPaths: nextPaths };
          }),
        };

        await saveProjects(merged);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "project add",
            data: {
              path: resolved,
              agentPaths: merged.projects.find((p) => p.root === resolved)?.agentPaths ?? {},
            },
          });
          return;
        }

        printInfo(`Project registered: ${resolved}`);
      } catch (error) {
        handleCommandError(options, "project add", error);
      }
    });

  project
    .command("list")
    .option("--json", "JSON output")
    .action(async (options) => {
      const projectsIndex = await loadProjects();
      const skillIndex = await loadIndex();
      const projectSkills = collectProjectSkills(skillIndex.skills);

      const projects = projectsIndex.projects.map((proj) => ({
        ...proj,
        skills: projectSkills.get(proj.root) ?? [],
      }));

      if (isJsonEnabled(options)) {
        printJson({ ok: true, command: "project list", data: { projects } });
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

  project
    .command("inspect")
    .argument("<path>", "Project path")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      const projectsIndex = await loadProjects();
      const skillIndex = await loadIndex();
      const resolved = path.resolve(inputPath);
      const proj = projectsIndex.projects.find((entry) => entry.root === resolved);

      if (!proj) {
        handleCommandError(
          options,
          "project inspect",
          new Error(`Project not registered: ${resolved}`)
        );
        return;
      }

      const skills = getProjectSkills(skillIndex.skills, resolved);
      const data = {
        root: proj.root,
        agentPaths: proj.agentPaths ?? {},
        skills,
      };

      if (isJsonEnabled(options)) {
        printJson({ ok: true, command: "project inspect", data });
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
      const skillIndex = await loadIndex();
      const resolved = path.resolve(inputPath);
      const installPaths = getProjectInstallPaths(skillIndex.skills, resolved);

      if (installPaths.size === 0) {
        handleCommandError(
          options,
          "project sync",
          new Error(`No skills recorded for project: ${resolved}`)
        );
        return;
      }

      for (const [skillName, paths] of installPaths.entries()) {
        await copySkillToInstallPaths(skillName, paths);
      }

      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "project sync",
          data: { root: resolved, skills: Array.from(installPaths.keys()).sort() },
        });
        return;
      }

      printInfo(`Synced ${installPaths.size} skill(s) for ${resolved}`);
    });
}
