import { fetchText } from "./fetcher.js";
import { fetchRepoFile, normalizeRepoRef } from "./repo-skills.js";
import { hashContent } from "./skill-store.js";
import type { IndexedSkill } from "./types.js";

export type SkillStatus = {
  name: string;
  source: string;
  trackable: boolean;
  outdated: boolean;
  localChecksum: string;
  remoteChecksum?: string;
  error?: string;
};

type StatusSkill = Pick<IndexedSkill, "name" | "source" | "checksum">;

function baseStatus(
  skill: StatusSkill,
  overrides: Partial<SkillStatus> & Pick<SkillStatus, "trackable" | "outdated">
): SkillStatus {
  return {
    name: skill.name,
    source: skill.source.type,
    localChecksum: skill.checksum,
    ...overrides,
  };
}

async function checkUrlSkill(skill: StatusSkill): Promise<SkillStatus> {
  if (!skill.source.url) {
    return baseStatus(skill, {
      trackable: true,
      outdated: false,
      error: "Missing url on url-sourced skill",
    });
  }

  try {
    const remoteText = await fetchText(skill.source.url);
    const remoteChecksum = hashContent(remoteText);
    return baseStatus(skill, {
      trackable: true,
      outdated: remoteChecksum !== skill.checksum,
      remoteChecksum,
    });
  } catch (err) {
    return baseStatus(skill, {
      trackable: true,
      outdated: false,
      error: err instanceof Error ? err.message : "Failed to check",
    });
  }
}

async function checkGitSkill(skill: StatusSkill): Promise<SkillStatus> {
  if (!skill.source.repo) {
    return baseStatus(skill, {
      trackable: true,
      outdated: false,
      error: "Missing repo on git-sourced skill",
    });
  }

  const [owner, repo] = skill.source.repo.split("/");
  if (!owner || !repo) {
    return baseStatus(skill, {
      trackable: true,
      outdated: false,
      error: `Invalid git repo ref: ${skill.source.repo}`,
    });
  }

  try {
    const skillPath = skill.source.path?.replace(/\/$/, "") ?? "";
    const ref = await normalizeRepoRef({
      owner,
      repo,
      ref: skill.source.ref ?? "main",
    });
    const skillFilePath = skillPath ? `${skillPath}/SKILL.md` : "SKILL.md";
    const markdown = await fetchRepoFile(ref, skillFilePath);
    const remoteChecksum = hashContent(markdown);

    return baseStatus(skill, {
      trackable: true,
      outdated: remoteChecksum !== skill.checksum,
      remoteChecksum,
    });
  } catch (err) {
    return baseStatus(skill, {
      trackable: true,
      outdated: false,
      error: err instanceof Error ? err.message : "Failed to check",
    });
  }
}

export async function checkSkillStatus(skill: StatusSkill): Promise<SkillStatus> {
  if (skill.source.type === "url") {
    return checkUrlSkill(skill);
  }
  if (skill.source.type === "git") {
    return checkGitSkill(skill);
  }

  return baseStatus(skill, {
    trackable: false,
    outdated: false,
  });
}
