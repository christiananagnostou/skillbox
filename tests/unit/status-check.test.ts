import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashContent } from "../../src/lib/skill-store.js";

vi.mock("../../src/lib/fetcher.js", () => ({
  fetchText: vi.fn(),
}));

vi.mock("../../src/lib/repo-skills.js", () => ({
  normalizeRepoRef: vi.fn(),
  fetchRepoFile: vi.fn(),
}));

import { fetchText } from "../../src/lib/fetcher.js";
import { fetchRepoFile, normalizeRepoRef } from "../../src/lib/repo-skills.js";
import { checkSkillStatus } from "../../src/lib/status-check.js";

const fetchTextMock = vi.mocked(fetchText);
const fetchRepoFileMock = vi.mocked(fetchRepoFile);
const normalizeRepoRefMock = vi.mocked(normalizeRepoRef);

const REMOTE_MARKDOWN = `---
name: demo
description: remote skill
---

# Demo
`;

describe("checkSkillStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks local skills as not trackable", async () => {
    const status = await checkSkillStatus({
      name: "local-one",
      source: { type: "local" },
      checksum: "abc",
    });

    expect(status).toMatchObject({
      name: "local-one",
      source: "local",
      trackable: false,
      outdated: false,
      localChecksum: "abc",
    });
    expect(status.remoteChecksum).toBeUndefined();
  });

  it("detects outdated url skills", async () => {
    fetchTextMock.mockResolvedValue(REMOTE_MARKDOWN);

    const status = await checkSkillStatus({
      name: "url-one",
      source: { type: "url", url: "https://example.com/SKILL.md" },
      checksum: "stale-checksum",
    });

    expect(fetchTextMock).toHaveBeenCalledWith("https://example.com/SKILL.md");
    expect(status.trackable).toBe(true);
    expect(status.outdated).toBe(true);
    expect(status.remoteChecksum).toBe(hashContent(REMOTE_MARKDOWN));
    expect(status.error).toBeUndefined();
  });

  it("detects up-to-date url skills", async () => {
    fetchTextMock.mockResolvedValue(REMOTE_MARKDOWN);
    const checksum = hashContent(REMOTE_MARKDOWN);

    const status = await checkSkillStatus({
      name: "url-two",
      source: { type: "url", url: "https://example.com/SKILL.md" },
      checksum,
    });

    expect(status.outdated).toBe(false);
    expect(status.remoteChecksum).toBe(checksum);
  });

  it("detects outdated git skills using the same SKILL.md path as update", async () => {
    normalizeRepoRefMock.mockResolvedValue({
      owner: "acme",
      repo: "skills",
      ref: "main",
    });
    fetchRepoFileMock.mockResolvedValue(REMOTE_MARKDOWN);

    const status = await checkSkillStatus({
      name: "git-one",
      source: {
        type: "git",
        repo: "acme/skills",
        path: "skills/git-one",
        ref: "main",
      },
      checksum: "stale-checksum",
    });

    expect(normalizeRepoRefMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "skills",
      ref: "main",
    });
    expect(fetchRepoFileMock).toHaveBeenCalledWith(
      { owner: "acme", repo: "skills", ref: "main" },
      "skills/git-one/SKILL.md"
    );
    expect(status).toMatchObject({
      name: "git-one",
      source: "git",
      trackable: true,
      outdated: true,
      localChecksum: "stale-checksum",
      remoteChecksum: hashContent(REMOTE_MARKDOWN),
    });
  });

  it("detects up-to-date git skills", async () => {
    const checksum = hashContent(REMOTE_MARKDOWN);
    normalizeRepoRefMock.mockResolvedValue({
      owner: "acme",
      repo: "skills",
      ref: "main",
    });
    fetchRepoFileMock.mockResolvedValue(REMOTE_MARKDOWN);

    const status = await checkSkillStatus({
      name: "git-two",
      source: { type: "git", repo: "acme/skills", ref: "main" },
      checksum,
    });

    expect(fetchRepoFileMock).toHaveBeenCalledWith(
      { owner: "acme", repo: "skills", ref: "main" },
      "SKILL.md"
    );
    expect(status.outdated).toBe(false);
    expect(status.remoteChecksum).toBe(checksum);
    expect(status.error).toBeUndefined();
  });

  it("returns an error for git skills missing repo metadata", async () => {
    const status = await checkSkillStatus({
      name: "git-broken",
      source: { type: "git" },
      checksum: "abc",
    });

    expect(status.trackable).toBe(true);
    expect(status.outdated).toBe(false);
    expect(status.error).toBe("Missing repo on git-sourced skill");
    expect(normalizeRepoRefMock).not.toHaveBeenCalled();
  });

  it("surfaces fetch failures without marking outdated", async () => {
    normalizeRepoRefMock.mockResolvedValue({
      owner: "acme",
      repo: "skills",
      ref: "main",
    });
    fetchRepoFileMock.mockRejectedValue(new Error("Failed to fetch remote"));

    const status = await checkSkillStatus({
      name: "git-err",
      source: { type: "git", repo: "acme/skills" },
      checksum: "abc",
    });

    expect(status.outdated).toBe(false);
    expect(status.error).toBe("Failed to fetch remote");
  });
});
