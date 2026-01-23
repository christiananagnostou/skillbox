import { describe, it, expect } from "vitest";
import { runCli, runCliJson, assertJsonResponse } from "../helpers/cli.js";

describe("agent command", () => {
  it("shows agent usage instructions", async () => {
    const result = await runCli(["agent"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skillbox");
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("update");
  });

  it("returns snippet with --json", async () => {
    const { result, data } = await runCliJson<{
      ok: boolean;
      command: string;
      data: { snippet: string };
    }>(["agent"]);

    expect(result.exitCode).toBe(0);
    assertJsonResponse(result, { ok: true, command: "agent" });
    expect(data?.data.snippet).toContain("skillbox");
    expect(data?.data.snippet).toContain("list");
  });
});
