# Skillbox v1 Plan

This document is the canonical plan for the Skillbox CLI and local skill manager. It is intended to be stable, thorough, and ready for implementation.

## Vision

Skillbox is a local-first, agent-agnostic skills manager. It unifies skills across multiple AI coding agents, tracks skill sources (URL/git/local), detects when remote skills are outdated, and syncs skills into agent-native folders for both user and project scopes.

The primary goals are:

- Provide a single CLI that manages skills across OpenCode, Claude Code, Codex, Cursor, Amp, and Antigravity.
- Preserve agent-native folder layouts so each agent can load skills without modification.
- Support URL-based skills that update over time.
- Keep a local index and canonical store with no external registry requirement.
- Be agent-friendly: stable output, JSON mode, predictable commands.

## Core Principles

- Local-first: no public registry required; everything is trackable locally.
- Agent-agnostic: support multiple agent folder layouts and conventions.
- Reproducible: skill sources and checksums are tracked.
- Transparent: status shows what is outdated and why.
- Safe defaults: system-level locations are read-only unless explicitly enabled.

## Primary Use Cases

1. Install a skill from a URL once and sync it to all supported agents.
2. Detect when a remote skill changes and update local copies.
3. Manage both user-level and project-level skills.
4. Group skills with metadata (namespace, categories, tags) without forcing folder nesting.
5. Allow agent-driven usage with stable CLI outputs and JSON responses.

## Scope and Non-Goals (v1)

In scope:

- Local index and canonical store
- URL, git, and local skill sources
- Per-agent sync to user and project skill folders
- Update detection and listing
- Agent-friendly CLI with JSON output
- Project registry and per-project agent configs

Out of scope (v1):

- Public registry or hosted marketplace
- Skill signing / cryptographic verification
- GUI
- Complex dependency resolution between skills

## Canonical Skill Format

Each skill is stored in the canonical store as:

- SKILL.md (required)
- skill.json (auto-generated)
- Optional supporting files (scripts, references, assets)

Skillbox accepts raw SKILL.md inputs and auto-generates skill.json to avoid forcing users to author JSON.

### skill.json (draft)

```
{
  "name": "string",
  "version": "0.1.0",
  "description": "string",
  "entry": "SKILL.md",
  "namespace": "string?",
  "categories": ["string"],
  "tags": ["string"],
  "source": {
    "type": "url|git|local",
    "url": "string?",
    "repo": "string?"
  },
  "checksum": "sha256",
  "updatedAt": "ISO-8601"
}
```

Notes:

- skill.json is for Skillbox only. Agents continue to read SKILL.md.
- namespace is metadata only; names remain flat in folders.

## Canonical Store

Default location:

- ~/.config/skillbox/skills/<name>/

The canonical store is the single source of truth for:

- Update detection (checksums)
- Source tracking (URL/git/local)
- Metadata (namespace, categories, tags)

Skills are copied into agent-specific folders during sync.

## Local Index

Skillbox maintains a local index at:

- ~/.config/skillbox/index.json

This index tracks:

- skill name
- source type and URL
- checksums (local and remote)
- lastChecked and lastSync timestamps
- installed agent targets (user + project)

## Project Registry

Skillbox tracks projects separately at:

- ~/.config/skillbox/projects.json

Each project entry includes:

- project root path
- agent-specific project skill paths (overrides)
- skills installed in that project
- link-to-global setting (optional)

## Update Detection

- URL sources: hash remote content and compare to local checksum.
- Git sources: store commit hash and compare to remote HEAD.
- Local-only sources: mark as manual (no update checks).

Status always checks the network (no cache by default). A cache may be added later.

## Sync Strategy

- Default: overwrite agent copies during update.
- System-level paths (e.g., /etc/codex/skills) are read-only unless --system is passed.

## CLI Commands (v1)

Core commands:

- skillbox add <url> [--name <name>] [--global] [--agents ...]
- skillbox convert <url> [--name <name>] [--output <dir>] [--agent]
- skillbox list [--group=category|namespace|source|project] [--json]
- skillbox status [--group=project|source] [--json]
- skillbox update [name] [--system] [--project <path>]
- skillbox import <path>
- skillbox meta set <name> --category foo --tag bar --namespace baz
- skillbox project add <path> [--agent-path agent=path]
- skillbox project list
- skillbox project inspect <path>
- skillbox project sync <path>
- skillbox agent

## Agent-Friendly UX

- --json output for all commands
- predictable exit codes
- stable field names in JSON output
- quickstart workflow for agents

## Agent Path Support

See docs/paths.md for full path table and sources.

## Distribution

- npm (primary): npm i -g skillbox
- Homebrew tap (secondary): christiananagnostou/homebrew-skillbox
- Windows: npm-only in v1

See docs/distribution.md for details.

## Implementation Plan (High-Level)

1. Scaffold CLI (TypeScript + Node)
2. Implement local index and canonical store
3. Implement agent path map + sync
4. Implement URL fetch + checksum + status
5. Add metadata editing
6. Add project registry and per-project config
7. Add JSON output for all commands
8. Add project sync and inspect commands
9. Add agent-friendly help output

This plan is the source of truth for v1 behavior.