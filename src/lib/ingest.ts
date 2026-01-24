import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { buildMetadata, parseSkillMarkdown } from "./skill-parser.js";
import { ensureSkillsDir, skillDir } from "./skill-store.js";
import type { SkillMetadata, SkillSource } from "./types.js";

const SKILL_NAME_REGEX = /^[a-z0-9-]+$/;

const frontmatterSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    "argument-hint": z.string().optional(),
    "disable-model-invocation": z.boolean().optional(),
    "user-invocable": z.boolean().optional(),
    "allowed-tools": z.array(z.string()).optional(),
    model: z.string().optional(),
    context: z.string().optional(),
    agent: z.string().optional(),
    hooks: z.unknown().optional(),
  })
  .strict();

const subcommandSchema = z
  .object({
    name: z.string().min(1).regex(SKILL_NAME_REGEX, "Subcommand names must be kebab-case."),
    body: z.string().min(1),
    frontmatter: frontmatterSchema.optional(),
  })
  .strict();

const supportingFileSchema = z
  .object({
    path: z.string().min(1),
    contents: z.string(),
  })
  .strict();

export const ingestSchema = z
  .object({
    name: z.string().min(1).regex(SKILL_NAME_REGEX, "Skill names must be kebab-case."),
    description: z.string().min(1),
    body: z.string().min(1),
    source: z.object({
      type: z.string().min(1),
      value: z.string().min(1),
    }),
    frontmatter: frontmatterSchema.optional(),
    namespace: z.string().optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    subcommands: z.array(subcommandSchema).optional(),
    supporting_files: z.array(supportingFileSchema).optional(),
  })
  .strict();

export type IngestSkill = z.infer<typeof ingestSchema>;
export type IngestSubcommand = z.infer<typeof subcommandSchema>;
export type IngestSupportingFile = z.infer<typeof supportingFileSchema>;

const FRONTMATTER_ORDER = [
  "name",
  "description",
  "argument-hint",
  "disable-model-invocation",
  "user-invocable",
  "allowed-tools",
  "model",
  "context",
  "agent",
  "hooks",
];

const INGEST_SCHEMA_TEXT = `Required JSON fields:\n- name (kebab-case)\n- description\n- body (markdown)\n- source { type, value }\n\nOptional fields:\n- frontmatter (Claude-allowed keys only)\n- namespace\n- categories, tags\n- subcommands [{ name, body, frontmatter? }]\n- supporting_files [{ path, contents }]\n\nRules:\n- SKILL.md frontmatter must include name + description\n- Subcommands are written as <name>.md in skill root\n- supporting_files paths must be relative (no .. or absolute paths)\n- Write JSON to ~/.config/skillbox/tmp/<name>.json or /tmp/skillbox-<name>.json\n- Or pipe JSON into: cat <file> | skillbox add --ingest -\n- Delete the JSON file after a successful ingest\n- Return JSON only (no markdown fences)`;

const INGEST_TEMPLATE_JSON = `{
  "name": "algolia-docs",
  "description": "Algolia docs guide for index management, search setup, and API usage. Use when working with Algolia indices, search configuration, ranking, or analytics.",
  "source": { "type": "url", "value": "https://www.algolia.com/doc" },
  "frontmatter": {
    "name": "algolia-docs",
    "description": "Algolia docs guide for index management, search setup, and API usage. Use when working with Algolia indices, search configuration, ranking, or analytics."
  },
  "body": "# Algolia\n\n## Quick start\n- ...",
  "namespace": "algolia",
  "categories": ["search", "docs"],
  "tags": ["algolia", "api"],
  "subcommands": [
    {
      "name": "algolia-index",
      "body": "# Algolia Indexing\n\n..."
    }
  ],
  "supporting_files": [
    {
      "path": "references/api.md",
      "contents": "# API Reference\n..."
    }
  ]
}`;

const DIFY_GUIDANCE = `Follow these skill-creator patterns:\n- Keep SKILL.md concise (<500 lines); put deep detail in references/\n- Use scripts/ only for deterministic repeated tasks\n- Avoid README, changelog, installation guides\n- Put "when to use" guidance in frontmatter description\n- Use progressive disclosure: link to references from SKILL.md\n- Body must not include YAML frontmatter (only use the frontmatter object)\n- Include sections: Quick start, Core workflow, Key concepts, Examples, References (use these exact labels)\nReference: https://raw.githubusercontent.com/langgenius/dify/main/.agents/skills/skill-creator/SKILL.md`;

export function buildIngestPrompt(input: string): string {
  return [
    "You are converting a source into a Skillbox skill.",
    `Input: ${input}`,
    "",
    "Task:",
    "1) Fetch the page and follow relevant documentation links.",
    "2) Synthesize a high-quality skill following Claude skill best practices.",
    "3) Return strict JSON matching the schema below.",
    "4) Save the JSON to ~/.config/skillbox/tmp/<name>.json or /tmp/skillbox-<name>.json.",
    "5) Or pipe JSON into: cat <file> | skillbox add --ingest -",
    "6) After a successful ingest, delete the JSON file.",
    "",
    DIFY_GUIDANCE,
    "",
    "Schema:",
    INGEST_SCHEMA_TEXT,
    "",
    "Template:",
    INGEST_TEMPLATE_JSON,
  ].join("\n");
}

export async function readIngestFile(filePath: string): Promise<IngestSkill> {
  const content = await fs.readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Ingest file is not valid JSON.");
  }
  const result = ingestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid ingest JSON. ${issues.join("; ")}`);
  }

  validateSupportingFiles(result.data.supporting_files ?? []);
  ensureBodyHasNoFrontmatter(result.data.body);
  return result.data;
}

export function buildSkillMarkdown(ingest: IngestSkill): string {
  const frontmatter = buildFrontmatter({
    ...ingest.frontmatter,
    name: ingest.name,
    description: ingest.description,
  });
  const body = ingest.body.trim();
  return `${frontmatter}\n\n${body}\n`;
}

export function buildSubcommandMarkdown(subcommand: IngestSubcommand): string {
  if (!subcommand.frontmatter) {
    return `${subcommand.body.trim()}\n`;
  }
  const frontmatter = buildFrontmatter({
    ...subcommand.frontmatter,
    name: subcommand.name,
  });
  return `${frontmatter}\n\n${subcommand.body.trim()}\n`;
}

export async function writeIngestedSkillFiles(
  ingest: IngestSkill,
  skillMarkdown: string,
  metadata: SkillMetadata
): Promise<void> {
  await ensureSkillsDir();
  const targetDir = skillDir(ingest.name);
  await ensureEmptySkillDir(targetDir, ingest.name);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "SKILL.md"), skillMarkdown, "utf8");
  await fs.writeFile(
    path.join(targetDir, "skill.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );

  for (const subcommand of ingest.subcommands ?? []) {
    const subcommandPath = path.join(targetDir, `${subcommand.name}.md`);
    await fs.writeFile(subcommandPath, buildSubcommandMarkdown(subcommand), "utf8");
  }

  for (const file of ingest.supporting_files ?? []) {
    const filePath = path.join(targetDir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.contents, "utf8");
  }
}

export function buildIngestSource(ingest: IngestSkill): SkillSource {
  return {
    type: "convert",
    value: ingest.source.value,
    url: ingest.source.type === "url" ? ingest.source.value : undefined,
  };
}

export function buildIngestMetadata(ingest: IngestSkill, skillMarkdown: string): SkillMetadata {
  const parsed = parseSkillMarkdown(skillMarkdown);
  if (!parsed.description) {
    throw new Error("Ingested skill is missing a description.");
  }
  const source = buildIngestSource(ingest);
  const metadata = buildMetadata(parsed, source, ingest.name);
  if (ingest.namespace) metadata.namespace = ingest.namespace;
  if (ingest.categories) metadata.categories = ingest.categories;
  if (ingest.tags) metadata.tags = ingest.tags;
  return metadata;
}

function buildFrontmatter(values: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const key of FRONTMATTER_ORDER) {
    if (!(key in values)) {
      continue;
    }
    const value = values[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const entry of value) {
        lines.push(`  - ${formatYamlValue(entry)}`);
      }
      continue;
    }
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }

  lines.push("---");
  return lines.join("\n");
}

function formatYamlValue(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function validateSupportingFiles(files: IngestSupportingFile[]): void {
  for (const file of files) {
    if (path.isAbsolute(file.path)) {
      throw new Error(`Supporting file path must be relative: ${file.path}`);
    }
    const normalized = path.posix.normalize(file.path);
    if (normalized.startsWith("..") || normalized.includes("/..")) {
      throw new Error(`Supporting file path cannot traverse directories: ${file.path}`);
    }
    if (file.path.endsWith("SKILL.md") || file.path.endsWith("skill.json")) {
      throw new Error(`Supporting file cannot overwrite SKILL.md or skill.json: ${file.path}`);
    }
  }
}

function ensureBodyHasNoFrontmatter(body: string): void {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("---")) {
    throw new Error("Ingest body must not include YAML frontmatter.");
  }
}

async function ensureEmptySkillDir(targetDir: string, skillName: string): Promise<void> {
  try {
    await fs.access(targetDir);
    throw new Error(`Skill already exists: ${skillName}. Use a different name.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
