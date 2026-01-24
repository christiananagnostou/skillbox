import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import {
  buildIngestMetadata,
  buildIngestPrompt,
  buildSkillMarkdown,
  buildSubcommandMarkdown,
  readIngestFile,
  writeIngestedSkillFiles,
} from "../../src/lib/ingest.js";
import { testEnv } from "../setup.js";

describe("ingest helpers", () => {
  it("reads and validates ingest JSON", async () => {
    const payload = {
      name: "ingest-helpers",
      description: "Test ingest helper",
      source: { type: "url", value: "https://example.com" },
      body: "# Ingest Helper\n\nBody",
      subcommands: [{ name: "helper-sub", body: "# Sub\n\nBody" }],
      supporting_files: [{ path: "references/info.md", contents: "# Info" }],
    };

    const ingestFile = path.join(testEnv.testRoot, "ingest-helper.json");
    await fs.writeFile(ingestFile, JSON.stringify(payload, null, 2));

    const ingest = await readIngestFile(ingestFile);
    expect(ingest.name).toBe("ingest-helpers");
    expect(ingest.subcommands?.[0].name).toBe("helper-sub");
  });

  it("writes SKILL.md and subcommand files", async () => {
    const ingest = {
      name: "ingest-write",
      description: "Test ingest write",
      source: { type: "url", value: "https://example.com" },
      body: "# Ingest Write\n\nBody",
      subcommands: [{ name: "write-sub", body: "# Sub\n\nBody" }],
    };

    const markdown = buildSkillMarkdown(ingest);
    const metadata = buildIngestMetadata(ingest, markdown);

    await writeIngestedSkillFiles(ingest, markdown, metadata);

    const skillDir = path.join(testEnv.skillsDir, "ingest-write");
    const skillFile = path.join(skillDir, "SKILL.md");
    const subcommandFile = path.join(skillDir, "write-sub.md");

    await expect(fs.readFile(skillFile, "utf8")).resolves.toContain("Ingest Write");
    await expect(fs.readFile(subcommandFile, "utf8")).resolves.toContain("Sub");
  });

  it("builds frontmatter with ordered keys", () => {
    const ingest = {
      name: "ordered",
      description: "Ordered frontmatter",
      source: { type: "url", value: "https://example.com" },
      body: "Body",
      frontmatter: {
        "allowed-tools": ["Read", "Write"],
        "argument-hint": "<path>",
      },
    };

    const markdown = buildSkillMarkdown(ingest);
    const frontmatter = markdown.split("---")[1] ?? "";
    expect(frontmatter.indexOf("name:")).toBeLessThan(frontmatter.indexOf("description:"));
    expect(frontmatter.indexOf("description:")).toBeLessThan(frontmatter.indexOf("argument-hint:"));
  });

  it("adds namespace, categories, and tags to metadata", () => {
    const ingest = {
      name: "meta-skill",
      description: "Metadata skill",
      source: { type: "url", value: "https://example.com" },
      body: "Body",
      namespace: "testing",
      categories: ["docs"],
      tags: ["tagged"],
    };

    const markdown = buildSkillMarkdown(ingest);
    const metadata = buildIngestMetadata(ingest, markdown);

    expect(metadata.namespace).toBe("testing");
    expect(metadata.categories).toEqual(["docs"]);
    expect(metadata.tags).toEqual(["tagged"]);
  });

  it("builds prompt with schema and template", () => {
    const prompt = buildIngestPrompt("https://example.com");
    expect(prompt).toContain("Schema:");
    expect(prompt).toContain("Template:");
    expect(prompt).toContain("https://example.com");
  });

  it("renders subcommand frontmatter", () => {
    const markdown = buildSubcommandMarkdown({
      name: "subcommand",
      body: "# Title\n\nBody",
      frontmatter: {
        description: "Subcommand description",
        "argument-hint": "<id>",
      },
    });

    expect(markdown).toContain("---");
    expect(markdown).toContain('name: "subcommand"');
    expect(markdown).toContain('description: "Subcommand description"');
    expect(markdown).toContain('argument-hint: "<id>"');
  });

  it("rejects invalid frontmatter keys", async () => {
    const payload = {
      name: "bad-frontmatter",
      description: "Bad frontmatter",
      source: { type: "url", value: "https://example.com" },
      body: "# Bad",
      frontmatter: {
        name: "bad-frontmatter",
        description: "Bad frontmatter",
        badKey: "nope",
      },
    };

    const ingestFile = path.join(testEnv.testRoot, "bad-frontmatter.json");
    await fs.writeFile(ingestFile, JSON.stringify(payload, null, 2));

    await expect(readIngestFile(ingestFile)).rejects.toThrow(/frontmatter: Unrecognized key/);
  });

  it("rejects body that includes frontmatter", async () => {
    const payload = {
      name: "bad-body",
      description: "Bad body",
      source: { type: "url", value: "https://example.com" },
      body: "---\nname: nope\n---\n\n# Body",
    };

    const ingestFile = path.join(testEnv.testRoot, "bad-body.json");
    await fs.writeFile(ingestFile, JSON.stringify(payload, null, 2));

    await expect(readIngestFile(ingestFile)).rejects.toThrow(/must not include yaml frontmatter/i);
  });

  it("rejects invalid supporting file paths", async () => {
    const payload = {
      name: "bad-support",
      description: "Bad support",
      source: { type: "url", value: "https://example.com" },
      body: "# Bad",
      supporting_files: [{ path: "../bad.md", contents: "no" }],
    };

    const ingestFile = path.join(testEnv.testRoot, "bad-support.json");
    await fs.writeFile(ingestFile, JSON.stringify(payload, null, 2));

    await expect(readIngestFile(ingestFile)).rejects.toThrow(/supporting file path/i);
  });
});
