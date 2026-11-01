import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerStatus } from "../src/commands/status.js";
import { loadIndex, saveIndex } from "../src/lib/index.js";
import { fetchRepoManifest, normalizeRepoRef } from "../src/lib/repo-skills.js";
import { readManagedManifest, hasManagedEdits } from "../src/lib/managed-manifest.js";
import { hashContent } from "../src/lib/skill-store.js";
import { printJson } from "../src/lib/output.js";
vi.mock("../src/lib/index.js", () => ({ loadIndex: vi.fn(), saveIndex: vi.fn() }));
vi.mock("../src/lib/repo-skills.js", () => ({
  fetchRepoManifest: vi.fn(),
  normalizeRepoRef: vi.fn(),
}));
vi.mock("../src/lib/managed-manifest.js", () => ({
  readManagedManifest: vi.fn(),
  hasManagedEdits: vi.fn(),
}));
vi.mock("../src/lib/output.js", () => ({
  isJsonEnabled: () => true,
  printJson: vi.fn(),
  printInfo: vi.fn(),
}));
describe("Git status regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readManagedManifest).mockResolvedValue({ "SKILL.md": hashContent("old") });
    vi.mocked(hasManagedEdits).mockResolvedValue(false);
    process.exitCode = 0;
    vi.mocked(loadIndex).mockResolvedValue({
      version: 1,
      skills: [
        {
          name: "demo",
          source: { type: "git", repo: "owner/repo", path: "skills/demo", ref: "main" },
          checksum: hashContent("old"),
          updatedAt: "",
        },
      ],
    });
    vi.mocked(normalizeRepoRef).mockResolvedValue({ owner: "owner", repo: "repo", ref: "main" });
    vi.mocked(saveIndex).mockResolvedValue(undefined);
  });
  it("queries Git and detects changed content", async () => {
    vi.mocked(fetchRepoManifest).mockResolvedValue({ "SKILL.md": hashContent("new") });
    const program = new Command();
    registerStatus(program);
    await program.parseAsync(["status", "--json"], { from: "user" });
    expect(fetchRepoManifest).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", ref: "main" },
      "skills/demo"
    );
    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ outdated: 1, upToDate: 0 }),
      })
    );
  });
  it("does not report an unreachable Git source current", async () => {
    vi.mocked(fetchRepoManifest).mockRejectedValue(new Error("offline"));
    const program = new Command();
    registerStatus(program);
    await program.parseAsync(["status", "--json"], { from: "user" });
    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, data: expect.objectContaining({ upToDate: 0 }) })
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
