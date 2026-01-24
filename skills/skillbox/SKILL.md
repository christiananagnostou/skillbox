---
name: skillbox
description: Manage skills with the skillbox CLI
---

# Skillbox

Use `skillbox` to manage AI agent skills. All commands support `--json` for machine-readable output.

## Core Workflow

```bash
skillbox list              # see installed skills
skillbox status            # check for outdated skills
skillbox update [name]     # update all or specific skill
```

## Adding Skills

| Command | Description |
|---------|-------------|
| `skillbox add owner/repo` | Install all skills from a repo |
| `skillbox add owner/repo --list` | List skills in a repo first |
| `skillbox add owner/repo --skill name` | Install specific skill |
| `skillbox add <url>` | Install from direct URL |
| `skillbox add --ingest <json>` | Ingest agent-converted skill JSON |

If a URL is not a valid `SKILL.md`, Skillbox prints an agent prompt with a strict JSON schema. Use an agent to fetch and extract the content, then run `skillbox add --ingest <json>`.

## Skill Conversion Guidelines

When creating skills from docs or web pages, follow these principles:

- Keep `SKILL.md` concise and action-oriented (under ~500 lines)
- Put deep documentation into `references/` files and link them from `SKILL.md`
- Use `scripts/` only for deterministic, repeated tasks
- Avoid extra docs (README, changelog, installation guides)
- Put "when to use" guidance in frontmatter `description`, not the body
- Use subcommands as root-level `<name>.md` files

Reference: https://raw.githubusercontent.com/langgenius/dify/main/.agents/skills/skill-creator/SKILL.md

## Removing Skills

```bash
skillbox remove <name>
```

## JSON Output

Always use `--json` when running programmatically:

```bash
skillbox list --json
skillbox status --json
skillbox update <name> --json
skillbox add <url> --json
```

## Tips

- Run `skillbox --help` or `skillbox <command> --help` to see all available options
- Run `skillbox status` periodically to check for updates
- Use `skillbox list` to see available skills and their subcommands
- GitHub API has a 60 req/hr limit for unauthenticated requests
