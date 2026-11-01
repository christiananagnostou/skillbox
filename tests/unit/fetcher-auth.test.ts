import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("GH_TOKEN", "");
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GH_HOST", "enterprise.example");
  vi.stubEnv("GH_ENTERPRISE_TOKEN", "enterprise-fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("content"))
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("GitHub credential destination", () => {
  it("requests only github.com CLI credentials despite enterprise host settings", async () => {
    vi.mocked(execFileSync).mockReturnValue("public-fixture-token\n");
    const { fetchText } = await import("../../src/lib/fetcher.js");
    await fetchText("https://api.github.com/repos/example/repo");
    expect(execFileSync).toHaveBeenCalledWith(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      expect.objectContaining({ timeout: 5000 })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/repo",
      expect.objectContaining({ headers: { Authorization: "Bearer public-fixture-token" } })
    );
  });
  it("does not look up credentials for public sources or HTTP GitHub URLs", async () => {
    const { fetchText } = await import("../../src/lib/fetcher.js");
    await fetchText("https://public.example/skill");
    await fetchText("http://api.github.com/skill");
    expect(execFileSync).not.toHaveBeenCalled();
    for (const call of vi.mocked(fetch).mock.calls) expect(call[1]?.headers).toEqual({});
  });
  it("does not use enterprise tokens when github.com lookup fails", async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("Not authenticated");
    });
    const { fetchText } = await import("../../src/lib/fetcher.js");
    await fetchText("https://raw.githubusercontent.com/example/repo/main/SKILL.md");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} })
    );
  });
});
