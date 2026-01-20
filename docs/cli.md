# Skillbox CLI Reference (Agent-Friendly)

This document defines the CLI surface for Skillbox. Commands are designed to be deterministic and easy for agents to use. All commands support --json for machine-readable output.

## Global Flags

- --json: Output structured JSON for agent consumption.
- --global: Apply to user scope instead of project scope.
- --agents <list>: Comma-separated list of agents to target.
- --project-only: Limit list output to indexed skills only.

## Config

Skillbox uses `~/.config/skillbox/config.json` to store defaults.

Defaults:

- defaultScope: project
- defaultAgents: [] (all agents)
- installMode: symlink (macOS/Linux) or copy (Windows) via `skillbox config set --install-mode <mode>`

## Onboarding

On first run, Skillbox detects installed agents and prompts for confirmation. Run `skillbox config set --add-agent <agent>` to add more later.

## Golden Workflow (Agent-Friendly)

1. List skills
   - skillbox list --json
2. Check for outdated skills
   - skillbox status --json
3. Update a skill
   - skillbox update <name> --json

## Commands

### skillbox add <url>

Install a skill from a URL and sync it to agent folders.

Examples:

- skillbox add https://example.com/skill/SKILL.md
- skillbox add https://example.com/skill/SKILL.md --name my-skill
- skillbox add https://example.com/skill/ --name my-skill --agents claude,cursor
- skillbox add https://example.com/skill/SKILL.md --global

Behavior:

- Validates that the URL points to a valid skill (SKILL.md or repo).
- If name cannot be inferred, requires --name.
- Generates skill.json in canonical store.
- Syncs to default agent targets unless --agents is provided.
- Defaults to project scope unless --global is passed.

### skillbox convert <url>

Convert arbitrary content into a skill. This is designed for agent usage. The agent is expected to transform the content into SKILL.md + metadata.

Examples:

- skillbox convert https://example.com/blog-post
- skillbox convert https://example.com/blog-post --agent
- skillbox convert https://example.com/blog-post --name research-skill --output ./drafts

Behavior:

- Fetches content.
- Writes a draft SKILL.md, skill.json, and source.txt into the output directory.
- If --agent is set, the agent should refine the draft and SKILL.md using source.txt.

### skillbox list

List all known skills across user + project scopes. Use --group to view categories, namespaces, sources, or projects. Use --project-only to skip user discovery.

Examples:

- skillbox list
- skillbox list --group=category
- skillbox list --group=namespace
- skillbox list --group=source
- skillbox list --group=project
- skillbox list --group=category
- skillbox list --json
- skillbox list --project-only --json

### skillbox status

Check for outdated skills by comparing local checksums to remote sources. Use --group to view by project or source.

Examples:

- skillbox status
- skillbox status --json
- skillbox status --group=project
- skillbox status --group=source

Output includes:

- name
- source type
- current checksum
- remote checksum
- outdated: true/false

### skillbox update [name]

Update one skill or all outdated skills.

Examples:

- skillbox update
- skillbox update my-skill
- skillbox update --project /path/to/repo

Behavior:

- Updates canonical store first, then refreshes agent links or copies.

### skillbox import [path]

Import an existing skill directory into Skillbox index, or bulk import global skills.

Examples:

- skillbox import .claude/skills/my-skill
- skillbox import /path/to/skill
- skillbox import --global

### skillbox meta set <name>

Set metadata fields for a skill.

Examples:

- skillbox meta set my-skill --category docs --category testing
- skillbox meta set my-skill --tag internal --tag format
- skillbox meta set my-skill --namespace team-ai

### skillbox config get

Show current config.

Examples:

- skillbox config get
- skillbox config get --json

### skillbox config set

Set config defaults.

Examples:

- skillbox config set --default-scope user
- skillbox config set --default-agent claude --default-agent cursor
- skillbox config set --add-agent codex
- skillbox config set --install-mode symlink
- skillbox config set --install-mode copy

### skillbox project add <path>

Register a project and its agent skill paths.

Examples:

- skillbox project add /path/to/repo

### skillbox project list

List tracked projects and their installed skills.

Examples:

- skillbox project list
- skillbox project list --json

### skillbox project inspect <path>

Show a single project with agent path overrides and installed skills.

Examples:

- skillbox project inspect /path/to/repo
- skillbox project inspect /path/to/repo --json

### skillbox project sync <path>

Re-copy canonical skills into a project’s agent skill paths.

Examples:

- skillbox project sync /path/to/repo
- skillbox project sync /path/to/repo --json

### skillbox agent

Print an agent-friendly usage snippet for AGENTS.md / CLAUDE.md.

Examples:

- skillbox agent
- skillbox agent --json

## JSON Output Contract (Draft)

All commands with --json return:

```
{
  "ok": true,
  "command": "list",
  "data": ...
}
```

If an error occurs:

```
{
  "ok": false,
  "command": "list",
  "error": {
    "message": "string",
    "code": "string"
  }
}
```

Fields in data are stable and documented per command in future versions.

## Agent Usage Snippet (AGENTS.md / CLAUDE.md)

```
Use skillbox for skill management.

Common workflow:
1) skillbox list --json
2) skillbox status --json
3) skillbox update <name> --json

If you need to install a new skill from a URL, run:
skillbox add <url> [--name <name>]

If a URL is not a valid skill, run:
skillbox convert <url> --agent
```
