import { describe, it, expect } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";

describe("config command", () => {
  describe("config get", () => {
    it("returns current configuration", async () => {
      const result = await runCli(["config", "get"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("defaultAgents");
      expect(result.stdout).toContain("defaultScope");
      expect(result.stdout).toContain("installMode");
    });

    it("returns JSON configuration with --json flag", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: {
          version: number;
          defaultAgents: string[];
          defaultScope: string;
          installMode: string;
        };
      }>(["config", "get"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "config get" });

      expect(data?.data.version).toBe(1);
      expect(data?.data.defaultAgents).toContain("claude");
      expect(data?.data.defaultScope).toBe("user");
      expect(data?.data.installMode).toBe("symlink");
    });
  });

  describe("config set", () => {
    it("sets default scope", async () => {
      const setResult = await runCli(["config", "set", "--default-scope", "project"]);
      expect(setResult.exitCode).toBe(0);

      const { data } = await runCliJson<{ data: { defaultScope: string } }>(["config", "get"]);
      expect(data?.data.defaultScope).toBe("project");

      // Reset
      await runCli(["config", "set", "--default-scope", "user"]);
    });

    it("sets install mode", async () => {
      const setResult = await runCli(["config", "set", "--install-mode", "copy"]);
      expect(setResult.exitCode).toBe(0);

      const { data } = await runCliJson<{ data: { installMode: string } }>(["config", "get"]);
      expect(data?.data.installMode).toBe("copy");

      // Reset
      await runCli(["config", "set", "--install-mode", "symlink"]);
    });

    it("adds agent to list with --add-agent", async () => {
      const setResult = await runCli(["config", "set", "--add-agent", "cursor"]);
      expect(setResult.exitCode).toBe(0);

      const { data } = await runCliJson<{ data: { defaultAgents: string[] } }>(["config", "get"]);
      expect(data?.data.defaultAgents).toContain("cursor");
      expect(data?.data.defaultAgents).toContain("claude");

      // Reset
      await runCli(["config", "set", "--default-agent", "claude"]);
    });

    it("replaces agent list with --default-agent", async () => {
      // First add an agent
      await runCli(["config", "set", "--add-agent", "cursor"]);

      // Then replace with single agent
      const setResult = await runCli(["config", "set", "--default-agent", "claude"]);
      expect(setResult.exitCode).toBe(0);

      const { data } = await runCliJson<{ data: { defaultAgents: string[] } }>(["config", "get"]);
      expect(data?.data.defaultAgents).toEqual(["claude"]);
    });

    it("returns JSON on success with --json flag", async () => {
      const { result, data } = await runCliJson<{
        ok: boolean;
        command: string;
        data: { defaultScope: string };
      }>(["config", "set", "--default-scope", "user"]);

      expect(result.exitCode).toBe(0);
      assertJsonResponse(result, { ok: true, command: "config set" });
      expect(data?.data.defaultScope).toBe("user");
    });
  });
});
