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

- Run `skillbox status` periodically to check for updates
- Use `skillbox list` to see available skills and their subcommands
- GitHub API has a 60 req/hr limit for unauthenticated requests
