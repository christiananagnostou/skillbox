import type { Command } from "commander";
import { isJsonEnabled, printInfo, printJson } from "../lib/output.js";
import { readSkillMetadata, writeSkillMetadata } from "../lib/skill-store.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { handleCommandError } from "../lib/command.js";

export const registerMeta = (program: Command): void => {
  const meta = program.command("meta").description("Manage skill metadata");

  meta
    .command("set")
    .argument("<name>", "Skill name")
    .option("--category <category>", "Category", collect)
    .option("--tag <tag>", "Tag", collect)
    .option("--namespace <namespace>", "Namespace")
    .option("--json", "JSON output")
    .action(async (name, options) => {
      try {
        const metadata = await readSkillMetadata(name);
        const categories = options.category ?? metadata.categories ?? [];
        const tags = options.tag ?? metadata.tags ?? [];
        const namespace = options.namespace ?? metadata.namespace;

        const nextMetadata = {
          ...metadata,
          categories: categories.length > 0 ? categories : undefined,
          tags: tags.length > 0 ? tags : undefined,
          namespace,
        };

        await writeSkillMetadata(name, nextMetadata);

        const index = await loadIndex();
        const updated = upsertSkill(index, {
          name,
          source: metadata.source,
          checksum: metadata.checksum,
          updatedAt: metadata.updatedAt,
          categories: nextMetadata.categories,
          tags: nextMetadata.tags,
          namespace: nextMetadata.namespace,
        });
        await saveIndex(sortIndex(updated));

        if (isJsonEnabled(options)) {
          printJson({
            ok: true,
            command: "meta set",
            data: {
              name,
              categories: nextMetadata.categories ?? [],
              tags: nextMetadata.tags ?? [],
              namespace: nextMetadata.namespace ?? null,
            },
          });
          return;
        }

        printInfo(`Updated metadata for ${name}`);
      } catch (error) {
        handleCommandError(options, "meta set", error);
      }
    });
};

const collect = (value: string, previous: string[] = []): string[] => {
  return [...previous, value];
};
