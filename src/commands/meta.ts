import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";

export const registerMeta = (program: Command): void => {
  const meta = program.command("meta").description("Manage skill metadata");

  meta
    .command("set")
    .argument("<name>", "Skill name")
    .option("--category <category>", "Category", collect)
    .option("--tag <tag>", "Tag", collect)
    .option("--namespace <namespace>", "Namespace")
    .option("--json", "JSON output")
    .action((name, options) => {
      if (isJsonEnabled(options)) {
        printJson({
          ok: true,
          command: "meta set",
          data: {
            name,
            categories: options.category ?? [],
            tags: options.tag ?? [],
            namespace: options.namespace ?? null
          }
        });
        return;
      }

      printInfo("Skillbox meta set is not implemented yet.");
      printInfo(`Skill: ${name}`);
      if (options.namespace) {
        printInfo(`Namespace: ${options.namespace}`);
      }
      if (options.category) {
        printInfo(`Categories: ${options.category.join(", ")}`);
      }
      if (options.tag) {
        printInfo(`Tags: ${options.tag.join(", ")}`);
      }
    });
};

const collect = (value: string, previous: string[] = []): string[] => {
  return [...previous, value];
};
