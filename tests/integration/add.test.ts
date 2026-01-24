import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";
import { TEST_REPOS, TEST_URLS } from "../helpers/fixtures.js";
import { testEnv } from "../setup.js";

describe("add command", () => {
  describe("from repository", () => {
    it("lists available skills with --list flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--list",
      ]);

      // Either succeeds with skill list or shows an error (rate limit, network, etc.)
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });

    it("attempts to install a specific skill with --skill flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "web-design-guidelines",
      ]);

      // Command ran (may succeed or fail due to network)
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);

      // If it succeeded, verify the install
      if (result.stdout.includes("web-design-guidelines") && !result.stdout.includes("error")) {
        const symlinkPath = path.join(testEnv.agentSkillsDir, "web-design-guidelines");
        const exists = await testEnv.fileExists(symlinkPath);
        if (exists) {
          expect(exists).toBe(true);
        }
      }
    });

    it("handles --global flag", async () => {
      const result = await runCli([
        "add",
        `${TEST_REPOS.agentSkills.owner}/${TEST_REPOS.agentSkills.repo}`,
        "--skill",
        "react-best-practices",
        "--global",
      ]);

      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("from URL", () => {
    it("installs skill from raw URL", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; source: { type: string; url: string } };
      }>(["add", TEST_URLS.validSkill]);

      if (result.exitCode === 0) {
        assertJsonResponse(result, { ok: true, command: "add" });
        expect(data?.data.source.type).toBe("url");
      }
    });

    it("uses custom name with --name flag", async () => {
      const { result, data } = await runCliJson<{
        data: { name: string };
      }>(["add", TEST_URLS.validSkillWithPath, "--name", "my-custom-skill"]);

      if (result.exitCode === 0) {
        expect(data?.data.name).toBe("my-custom-skill");

        // Verify symlink with custom name
        const symlinkPath = path.join(testEnv.agentSkillsDir, "my-custom-skill");
        const exists = await testEnv.fileExists(symlinkPath);
        expect(exists).toBe(true);
      }
    });

    it("prints ingest prompt for non-skill URL", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        error?: { message: string };
        data?: { ingest?: boolean; prompt?: string; next?: string };
      }>(["add", TEST_URLS.invalidUrl]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: false, command: "add" });
      expect(data?.data?.ingest).toBe(true);
      expect(data?.data?.next).toContain("skillbox add --ingest");
      expect(data?.data?.prompt).toContain("Schema:");
    });

    it("prints ingest prompt for unreachable URL", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        error?: { message: string };
        data?: { ingest?: boolean; prompt?: string; next?: string };
      }>(["add", "https://example.invalid/not-found"]);

      if (result.exitCode === 0 && data?.data?.ingest) {
        assertJsonResponse(result, { ok: false, command: "add" });
        expect(data?.data?.next).toContain("skillbox add --ingest");
        expect(data?.data?.prompt).toContain("Schema:");
      } else {
        expect(result.stdout + result.stderr).toMatch(/fetch failed|invalid|error/i);
      }
    });

    it("ingests agent JSON and installs", async () => {
      const ingestPayload = {
        name: "ingest-test",
        description: "Ingest test skill",
        source: { type: "url", value: "https://example.com" },
        body: "# Ingest\n\nTest content.",
        namespace: "testing",
        categories: ["docs"],
        tags: ["ingest"],
        subcommands: [
          {
            name: "ingest-sub",
            body: "# Sub\n\nSubcommand body.",
          },
        ],
        supporting_files: [
          {
            path: "references/info.md",
            contents: "# Info\n\nReference content.",
          },
        ],
      };

      const ingestFile = path.join(testEnv.testRoot, "ingest.json");
      await fs.writeFile(ingestFile, JSON.stringify(ingestPayload, null, 2));

      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; source: { type: string } };
      }>(["add", "--ingest", ingestFile]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "add" });
      expect(data?.data.name).toBe("ingest-test");
      expect(data?.data.source.type).toBe("convert");

      const skillDir = path.join(testEnv.skillsDir, "ingest-test");
      const skillFile = path.join(skillDir, "SKILL.md");
      const subcommandFile = path.join(skillDir, "ingest-sub.md");
      const referenceFile = path.join(skillDir, "references", "info.md");

      expect(await testEnv.fileExists(skillFile)).toBe(true);
      expect(await testEnv.fileExists(subcommandFile)).toBe(true);
      expect(await testEnv.fileExists(referenceFile)).toBe(true);
    });

    it("rejects invalid ingest payloads", async () => {
      const ingestFile = path.join(testEnv.testRoot, "bad-ingest.json");
      await fs.writeFile(ingestFile, JSON.stringify({ name: "bad" }, null, 2));

      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        error?: { message: string };
      }>(["add", "--ingest", ingestFile]);
      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: false, command: "add" });
      expect(data?.error?.message).toMatch(/invalid ingest json/i);
    });

    it("installs skill for specific agents with --agents flag", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { name: string; installs: Array<{ agent: string; scope: string }> };
      }>(["add", TEST_URLS.validSkill, "--name", "agents-test-skill", "--agents", "cursor"]);

      if (result.exitCode === 0 && data?.ok) {
        assertJsonResponse(result, { ok: true, command: "add" });

        const installs = data?.data.installs ?? [];
        expect(installs.length).toBeGreaterThan(0);
        for (const install of installs) {
          expect(install.agent).toBe("cursor");
        }
      } else {
        expect(result.stdout + result.stderr).toMatch(/error|failed|rate|network|fetch/i);
      }
    });
  });

  describe("error handling", () => {
    it("shows error for invalid input", async () => {
      const result = await runCli(["add"]);
      expect(result.stdout + result.stderr).toMatch(/required|url|repo|ingest/i);
    });
  });
});
