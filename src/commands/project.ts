import type { Command } from "commander";
import path from "node:path";
import { agentPaths, allAgents } from "../lib/agents.js";
import { handleCommandError } from "../lib/command.js";
import { discoverSkills } from "../lib/discovery.js";
import { collect } from "../lib/fs-utils.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { collectProjectSkills, getProjectInstallPaths, getProjectSkills } from "../lib/installs.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadProjects, saveProjects, upsertProject } from "../lib/projects.js";
import { importSkillFromDir } from "../lib/skill-store.js";
import { copySkillToInstallPaths } from "../lib/sync.js";

function getProjectSkillPaths(projectRoot: string): string[] {
  const paths = agentPaths(projectRoot);
  const seen = new Set<string>();

  // Add generic skills/ directory
  seen.add(path.join(projectRoot, "skills"));

  // Add all agent-specific project paths
  for (const agent of allAgents) {
    for (const agentPath of paths[agent].project) {
      seen.add(agentPath);
    }
  }

  return Array.from(seen);
}

async function discoverProjectSkills(projectRoot: string): Promise<string[]> {
  const skillPaths = getProjectSkillPaths(projectRoot);
  const discovered = await discoverSkills(skillPaths);

  if (discovered.length === 0) {
    return [];
  }

  const index = await loadIndex();
  const imported: string[] = [];

  for (const skill of discovered) {
    const data = await importSkillFromDir(skill.skillFile);
    if (!data) {
      continue;
    }

    const updated = upsertSkill(index, {
      name: data.name,
      source: { type: "local" },
      checksum: data.checksum,
      updatedAt: data.updatedAt,
      installs: [{ scope: "project", agent: "claude", path: skill.skillDir, projectRoot }],
    });
    index.skills = updated.skills;
    imported.push(data.name);
  }

  if (imported.length > 0) {
    await saveIndex(sortIndex(index));
  }

  return imported;
}

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
    .description("Register a project and import skills from its skills/ directory")
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

        const importedSkills = await discoverProjectSkills(resolved);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "project add",
            data: {
              path: resolved,
              agentPaths: merged.projects.find((p) => p.root === resolved)?.agentPaths ?? {},
              skills: importedSkills,
            },
          });
          return;
        }

        printInfo(`Project registered: ${resolved}`);
        if (importedSkills.length > 0) {
          printInfo(`Discovered ${importedSkills.length} skill(s): ${importedSkills.join(", ")}`);
        }
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
