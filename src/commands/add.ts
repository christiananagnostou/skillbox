import type { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { assertCanonicalReplaceable } from "../lib/managed-guard.js";
import { writeManagedManifest } from "../lib/managed-manifest.js";
import { publishDirectory } from "../lib/directory-publish.js";
import { handleCommandError } from "../lib/command.js";
import { loadConfig } from "../lib/config.js";
import { fetchText } from "../lib/fetcher.js";
import { collect, exists } from "../lib/fs-utils.js";
import { loadIndex, saveIndex, sortIndex, upsertSkill } from "../lib/index.js";
import { recordInstallPaths } from "../lib/installs.js";
import {
  isJsonEnabled,
  printInfo,
  printJson,
  printSuccess,
  startSpinner,
  stopSpinner,
} from "../lib/output.js";
import { buildProjectAgentPaths } from "../lib/project-paths.js";
import { ensureProjectRegistered, resolveRuntime } from "../lib/runtime.js";
import { buildMetadata, inferNameFromUrl, parseSkillMarkdown } from "../lib/skill-parser.js";
import { ensureSkillsDir, skillDir } from "../lib/skill-store.js";
import { buildSymlinkWarning, buildTargets, installSkillToTargets } from "../lib/sync.js";
import type { SkillInstall } from "../lib/types.js";
import { handleRepoInstall, isRepoUrl } from "./add-repo.js";

export function registerAdd(program: Command): void {
  program
    .command("add")
    .argument("<url>", "Skill URL or repo")
    .option("--name <name>", "Override skill name")
    .option("--global", "Install to user scope")
    .option("--agents <list>", "Comma-separated agent list")
    .option("--skill <skill>", "Skill name to install", collect)
    .option("--list", "List skills in repo without installing")
    .option("--json", "JSON output")
    .action(async (url, options) => {
      try {
        if (options.list || options.skill || isRepoUrl(url)) {
          await handleRepoInstall(url, {
            global: options.global,
            agents: options.agents,
            json: options.json,
            list: options.list,
            skill: options.skill,
          });
          return;
        }

        const showProgress = !isJsonEnabled(options);
        const inferred = inferNameFromUrl(url);
        const displayName = options.name ?? inferred ?? "skill";

        if (showProgress) {
          startSpinner(`Adding ${displayName}`);
        }

        const skillMarkdown = await fetchText(url);
        const parsed = parseSkillMarkdown(skillMarkdown);
        const skillName = options.name ?? inferred ?? parsed.name;

        if (!skillName) {
          if (showProgress) stopSpinner();
          throw new Error("Unable to infer skill name. Use --name to specify it.");
        }

        if (!parsed.name && !options.name) {
          if (showProgress) stopSpinner();
          throw new Error("Skill frontmatter missing name. Provide --name to continue.");
        }

        if (!parsed.description) {
          if (showProgress) stopSpinner();
          throw new Error(
            "Skill frontmatter missing description. Convert the source into a valid skill."
          );
        }

        const metadata = buildMetadata(parsed, { type: "url", url }, skillName);

        await assertCanonicalReplaceable(skillName, { type: "url", url });
        const index = await loadIndex();
        const existing = index.skills.find((skill) => skill.name === skillName);
        if (existing && existing.checksum !== parsed.checksum) {
          throw new Error(
            "This source has changed. Run skillbox update before adding another installation of shared content."
          );
        }
        if (!existing || !(await exists(skillDir(skillName)))) {
          await ensureSkillsDir();
          const staging = await fs.mkdtemp(`${skillDir(skillName)}.staging-`);
          try {
            await fs.writeFile(path.join(staging, "SKILL.md"), skillMarkdown, "utf8");
            await fs.writeFile(
              path.join(staging, "skill.json"),
              JSON.stringify(metadata) + "\n",
              "utf8"
            );
            await writeManagedManifest(staging);
            await publishDirectory(staging, skillDir(skillName));
          } finally {
            await fs.rm(staging, { recursive: true, force: true });
          }
        }

        const updated = upsertSkill(index, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
        });

        const { projectRoot, scope, agentList } = await resolveRuntime({
          global: options.global,
          agents: options.agents,
        });
        const projectEntry = await ensureProjectRegistered(projectRoot, scope);
        const paths = buildProjectAgentPaths(projectRoot, projectEntry);
        const config = await loadConfig();
        const installed: { agent: string; scope: string; targets: string[] }[] = [];
        const installs: SkillInstall[] = [];
        const recordedPaths = new Set<string>();
        const failures: Array<{ path: string; error: string }> = [];
        await saveIndex(sortIndex(updated));

        for (const agent of agentList) {
          const map = paths[agent];
          if (!map) {
            continue;
          }
          const targets = buildTargets(agent, map, scope).map((target) =>
            path.join(target.path, skillName)
          );
          const results = await installSkillToTargets(skillName, targets, config);
          const warnings = buildSymlinkWarning(agent, results);
          if (showProgress) for (const warning of warnings) printInfo(warning);
          for (const result of results) {
            if (result.error || result.mode === "skipped")
              failures.push({ path: result.path, error: result.error ?? "Installation skipped" });
          }
          const successful = results
            .filter((result) => !result.error && result.mode !== "skipped")
            .map((result) => result.path);
          const deduped = recordInstallPaths(successful, recordedPaths);
          if (deduped.length > 0) {
            installed.push({ agent, scope, targets: deduped });
            for (const target of deduped) {
              installs.push({
                scope,
                agent,
                path: target,
                projectRoot: scope === "project" ? projectRoot : undefined,
              });
            }
          }
        }

        const nextIndex = upsertSkill(updated, {
          name: skillName,
          source: { type: "url", url },
          checksum: parsed.checksum,
          updatedAt: metadata.updatedAt,
          installs,
        });
        await saveIndex(sortIndex(nextIndex));

        if (failures.length) process.exitCode = 1;
        if (isJsonEnabled(options)) {
          stopSpinner();
          printJson({
            ok: failures.length === 0,
            command: "add",
            ...(failures.length
              ? { error: { message: "Some install targets failed; canonical content was saved." } }
              : {}),
            data: {
              name: skillName,
              source: { type: "url", url },
              scope,
              installs,
              failures,
            },
          });
          return;
        }

        if (failures.length)
          throw new Error("Some install targets failed; canonical content was saved.");
        printSuccess(skillName);
        printInfo(`\nAdded skill from ${url}.`);
      } catch (error) {
        handleCommandError(options, "add", error);
      }
    });
}
