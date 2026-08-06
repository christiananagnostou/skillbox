# Skillbox masterplan

Living post-v1 backlog grounded in the 2026-08-06 implementation audit. Prefer this over ad-hoc next-step chat when prioritizing work.

Related vault: `Brain/skillbox` → [[wiki/reference/known-gaps]] (external knowledge base; not shipped with the package).

## Current product reality

- Package: `skillbox@0.3.7` (Node CLI, canonical store under `~/.config/skillbox/`).
- Golden workflow advertised: `list` → `status` → `update`.
- Gaps make that workflow partially dishonest (see below).

## Priority queue

### P0 — Make `status` real for git skills

**Problem:** `status` sets `trackable: true` for `source.type === "git"` but never fetches remote content. Git skills always appear up to date unless an error path is hit. `update` already refreshes git skills by fetching `SKILL.md` and rewriting the canonical tree.

**Done when:**

- [x] Git sources remote-check the same `SKILL.md` path resolution as `update`
- [x] Outdated means remote SHA-256 ≠ local `checksum`
- [x] Errors surface as `? name (message)` / JSON `error` without marking outdated
- [x] Tests cover up-to-date, outdated, and missing-repo cases
- [ ] PR merged

**Approach:** content checksum of remote `SKILL.md` (aligned with `update` and URL status), not commit-SHA tracking from the original v1 plan text in `docs/plan.md`.

### P1 — Resolve default-scope conflict

**Problem:**

| Source | Claim |
| --- | --- |
| `defaultConfig()` | `defaultScope: "user"` |
| Config integration tests | expect `"user"` |
| `resolveRuntime` nullish fallback | `?? "project"` |
| `AGENTS.md` | default scope is `project` |

**Done when:** one documented default, matching `defaultConfig`, runtime fallback, AGENTS.md, and tests.

### P2 — Land or drop OpenCode Claude-compat path change

**Problem:** Working tree (as of audit) removes OpenCode dual-write to `.claude/skills`; HEAD still dual-maps. Docs/paths may already match the narrower map while published code does not.

**Done when:** code + `docs/paths.md` + release notes agree; either commit the removal or restore dual paths.

### P3 — Copy-mode completeness

**Problem:** `copyFiles` skips subdirectories. Nested skill assets are dropped under `installMode: "copy"` (Windows default).

**Done when:** recursive copy **or** documented “flat skills only” with a test that locks the chosen behavior.

### P4 — Install records vs filesystem success

**Problem:** add flows record intended install paths even when symlink mode skips (e.g. EEXIST). Index can claim installs that are absent on disk.

**Done when:** either only successful targets are recorded, or status/list clearly distinguish intended vs present installs.

## Explicit non-priorities (for now)

- Re-investigating historical add/update test flakes without a failing repro (audit: 101/101 green).
- Public registry / marketplace.
- Commit-hash-based git tracking until checksum-based status/update parity is solid.
- Roadmap features not grounded in a decision or user request.

## How to use this doc

1. Pick the highest open P-item.
2. Implement on a focused branch; keep unrelated working-tree edits out.
3. Check the matching box under **Done when** when evidence lands.
4. After merge, update this file (and the vault known-gaps page on the next vault ingest).

## Changelog

| Date | Note |
| --- | --- |
| 2026-08-06 | Masterplan created from implementation audit + known gaps. P0 started (git status remote check). |
