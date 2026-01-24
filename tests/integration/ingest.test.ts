import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import {
  buildIngestMetadata,
  buildSkillMarkdown,
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
