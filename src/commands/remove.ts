import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { handleCommandError } from "../lib/command.js";
import { loadIndex, saveIndex, sortIndex } from "../lib/index.js";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { skillDir } from "../lib/skill-store.js";

type InstallInfo = {
  scope: string;
  agent: string;
  path: string;
  projectRoot?: string;
};

async function removePaths(paths: string[]): Promise<void> {
  for (const target of paths) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

function groupInstallsByScope(installs: InstallInfo[]): Map<string, InstallInfo[]> {
  const groups = new Map<string, InstallInfo[]>();

  for (const install of installs) {
    const key = install.scope === "project" ? `project:${install.projectRoot}` : "user";
    const existing = groups.get(key) ?? [];
    existing.push(install);
    groups.set(key, existing);
  }

  return groups;
}

function printRemovedInstalls(installs: InstallInfo[]): void {
  const groups = groupInstallsByScope(installs);

  // Sort: user scope first, then projects
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "user") return -1;
    if (b === "user") return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const groupInstalls = groups.get(key) ?? [];
    const label = key === "user" ? "user" : key.replace("project:", "project: ");

    for (const install of groupInstalls) {
      printInfo(`  ✓ ${label}/${install.agent}`);
    }
  }
}

export function registerRemove(program: Command): void {
  program
    .command("remove")
    .argument("<name>", "Skill name")
    .option("--project <path>", "Only remove installs for a project")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const index = await loadIndex();
        const skill = index.skills.find((entry) => entry.name === name);

        if (!skill) {
          throw new Error(`Skill not found: ${name}`);
        }

        const projectRoot = options.project ? path.resolve(options.project) : null;
        const installs = skill.installs ?? [];

        const isProjectInstall = (install: (typeof installs)[number]): boolean =>
          install.scope === "project" &&
          Boolean(install.projectRoot) &&
          install.projectRoot === projectRoot;

        const toRemove = projectRoot ? installs.filter(isProjectInstall) : installs;

        if (projectRoot && toRemove.length === 0) {
          throw new Error(`No installs found for ${name} in ${projectRoot}.`);
        }

        const removedPaths = toRemove.map((install) => install.path);
        await removePaths(removedPaths);

        let removedCanonical = false;
        if (projectRoot) {
          const remaining = installs.filter((install) => !isProjectInstall(install));
          index.skills = index.skills.map((entry) =>
            entry.name === name
              ? { ...entry, installs: remaining.length > 0 ? remaining : undefined }
              : entry
          );
        } else {
          index.skills = index.skills.filter((entry) => entry.name !== name);
          await fs.rm(skillDir(name), { recursive: true, force: true });
          removedCanonical = true;
        }

        await saveIndex(sortIndex(index));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "remove",
            data: {
              name,
              project: projectRoot,
              removed: toRemove,
              removedCanonical,
            },
          });
          return;
        }

        printInfo(`Skill Removal: ${name}`);

        if (toRemove.length > 0) {
          printInfo("");
          printInfo("Removed from:");
          printRemovedInstalls(toRemove as InstallInfo[]);
        }
      } catch (error) {
        handleCommandError(options, "remove", error);
      }
    });
}
