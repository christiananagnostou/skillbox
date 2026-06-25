import { describe, it, expect } from "vitest";
import { runCliJson } from "../helpers/cli.js";

const normalizePrompt = (prompt: string): string => {
  return prompt.replace(/\s+/g, " ").trim();
};

describe("add prompt output", () => {
  it("includes stable schema sections", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data?: { ingest?: boolean; prompt?: string };
    }>(["add", "https://example.com/not-a-skill.md"]);

    expect(result.exitCode).toBe(0);
    expect(data?.data?.ingest).toBe(true);

    const prompt = normalizePrompt(data?.data?.prompt ?? "");
    expect(prompt).toContain("Schema:");
    expect(prompt).toContain("Template:");
    expect(prompt).toContain("Required JSON fields:");
    expect(prompt).toContain("Optional fields:");
    expect(prompt).toContain("Quick start");
    expect(prompt).toContain("Core workflow");
    expect(prompt).toContain("Key concepts");
    expect(prompt).toContain("Examples");
    expect(prompt).toContain("References");
    expect(prompt).toContain("skill-creator/SKILL.md");
  });
});
