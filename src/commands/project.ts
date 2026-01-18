import type { Command } from "commander";
import path from "node:path";
import { isJsonEnabled, printError, printInfo, printJson } from "../lib/output.js";
import { loadProjects, saveProjects, upsertProject } from "../lib/projects.js";

export const registerProject = (program: Command): void => {
  const project = program.command("project").description("Manage projects");

  project
    .command("add")
    .argument("<path>", "Project path")
    .option("--json", "JSON output")
    .action(async (inputPath, options) => {
      try {
        const resolved = path.resolve(inputPath);
        const index = await loadProjects();
        const updated = upsertProject(index, resolved);
        await saveProjects(updated);

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "project add",
            data: {
              path: resolved
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
      const index = await loadProjects();
      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "project list",
          data: {
            projects: index.projects
          }
        });
        return;
      }

      printInfo(`Projects: ${index.projects.length}`);
      for (const entry of index.projects) {
        printInfo(`- ${entry.root}`);
      }
    });
};
