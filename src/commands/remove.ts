import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { loadIndex, saveIndex, sortIndex } from "../lib/index.js";
import { skillDir } from "../lib/skill-store.js";
import { handleCommandError } from "../lib/command.js";

const removePaths = async (paths: string[]): Promise<void> => {
  for (const target of paths) {
    await fs.rm(target, { recursive: true, force: true });
  }
};

export const registerRemove = (program: Command): void => {
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
        const toRemove = projectRoot
          ? installs.filter(
              (install) =>
                install.scope === "project" &&
                install.projectRoot &&
                install.projectRoot === projectRoot
            )
          : installs;

        if (projectRoot && toRemove.length === 0) {
          throw new Error(`No installs found for ${name} in ${projectRoot}.`);
        }

        const removedPaths = toRemove.map((install) => install.path);
        await removePaths(removedPaths);

        let removedCanonical = false;
        if (projectRoot) {
          const remaining = installs.filter(
            (install) =>
              !(
                install.scope === "project" &&
                install.projectRoot &&
                install.projectRoot === projectRoot
              )
          );
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
              removed: removedPaths,
              removedCanonical,
            },
          });
          return;
        }

        if (projectRoot) {
          printInfo(`Removed ${removedPaths.length} install(s) for ${name} in ${projectRoot}.`);
        } else {
          printInfo(`Removed ${name} and ${removedPaths.length} install(s).`);
        }
      } catch (error) {
        handleCommandError(options, "remove", error);
      }
    });
};
