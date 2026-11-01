import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { handleRepoInstall } from "../../src/commands/add-repo.js";
import { loadIndex, saveIndex } from "../../src/lib/index.js";
import { testEnv } from "../setup.js";

vi.mock("../../src/lib/project-paths.js", () => ({
  buildProjectAgentPaths: () => ({
    claude: {
      user: [testEnv.agentSkillsDir],
      project: [path.join(testEnv.projectDir, ".claude/skills")],
    },
  }),
}));

const markdown = "---\nname: demo\ndescription: Fixture\n---\nUnchanged";
const options = { global: true, agents: "claude", json: true };
function repository(): { files: Record<string, string>; sha: string } {
  const state = {
    files: { "SKILL.md": markdown, "references/guide.md": "old guide" },
    sha: "a".repeat(40),
  };
  vi.stubEnv("GITHUB_TOKEN", "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/commits/main")) return Response.json({ sha: state.sha });
      if (url.includes("/git/trees/"))
        return Response.json({
          tree: Object.keys(state.files).map((name) => ({
            path: `skills/demo/${name}`,
            type: "blob",
          })),
        });
      const name = url.split(`/${state.sha}/skills/demo/`)[1];
      if (!name || !(name in state.files)) throw new Error("Unexpected snapshot URL");
      return new Response(state.files[name as keyof typeof state.files]);
    })
  );
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = 0;
});

it("refuses re-add auxiliary changes across shared scopes", async () => {
  const state = repository();
  const logs = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await handleRepoInstall("fixture/repo", options);
  expect(process.exitCode ?? 0).toBe(0);
  state.files["references/guide.md"] = "new upstream guide";
  state.sha = "b".repeat(40);
  logs.mockClear();
  await handleRepoInstall("fixture/repo", options);
  expect(process.exitCode).toBe(1);
  expect(logs).toHaveBeenCalledTimes(1);
  const result = JSON.parse(String(logs.mock.calls[0][0]));
  expect(result.ok).toBe(false);
  expect(result.data.failed[0].reason).toContain("unscoped update");
  expect(await fs.readFile(path.join(testEnv.skillsDir, "demo/references/guide.md"), "utf8")).toBe(
    "old guide"
  );
});

it("reports occupied target failure as clean JSON while retaining canonical index", async () => {
  repository();
  const target = path.join(testEnv.agentSkillsDir, "demo");
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "personal.md"), "mine");
  const logs = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await handleRepoInstall("fixture/repo", options);
  expect(process.exitCode).toBe(1);
  expect(logs).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(logs.mock.calls[0][0])).ok).toBe(false);
  const skill = (await loadIndex()).skills.find((entry) => entry.name === "demo");
  expect(skill).toBeDefined();
  expect(skill?.installs ?? []).toEqual([]);
  expect(await fs.readFile(path.join(target, "personal.md"), "utf8")).toBe("mine");
  expect(await testEnv.fileExists(path.join(testEnv.skillsDir, "demo/SKILL.md"))).toBe(true);
});

it("refuses re-adding a disabled skill", async () => {
  repository();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await handleRepoInstall("fixture/repo", options);
  const index = await loadIndex();
  index.skills[0].disabled = true;
  await saveIndex(index);
  await handleRepoInstall("fixture/repo", options);
  expect(process.exitCode).toBe(1);
  expect((await loadIndex()).skills[0].disabled).toBe(true);
});
