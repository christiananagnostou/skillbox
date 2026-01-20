# skillbox

> Local-first, agent-agnostic skills manager. Track, update, and sync skills across popular AI coding agents with one CLI.

[![CI](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml/badge.svg)](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/skillbox.svg)](https://www.npmjs.com/package/skillbox)

## Installation

### npm (recommended)

```bash
npm install -g skillbox
```



## Quick Start

Skillbox will detect installed agents on your machine. If detection succeeds, `enter` accepts the detected list; if nothing is found, `enter` defaults to all agents or you can type a comma-separated list. Repo installs can source multiple skills from GitHub and track their repo origin for updates.

Tip: run `skillbox list` right after install to see existing skills.

Skillbox links agent folders to the canonical store using symlinks on macOS/Linux and file copies on Windows.

```bash
skillbox add https://example.com/skills/linting/SKILL.md
skillbox add owner/repo --list
skillbox add owner/repo --skill linting
skillbox add owner/repo --yes
skillbox list
skillbox status
skillbox update linting
```

## Commands

### Core Commands

```bash
skillbox add <url> [--name <name>] [--global] [--agents ...]
skillbox add <repo> [--list] [--skill <name>] [--yes] [--global] [--agents ...]
skillbox convert <url> [--name <name>] [--output <dir>] [--agent]
skillbox list [--group=category|namespace|source|project] [--json]
skillbox status [--group=project|source] [--json]
skillbox update [name] [--project <path>]
skillbox remove <name> [--project <path>]
skillbox import <path>
skillbox meta set <name> --category foo --tag bar --namespace baz
skillbox agent
```

### Project Commands

```bash
skillbox project add <path> [--agent-path agent=path]
skillbox project list
skillbox project inspect <path>
skillbox project sync <path>
```

### Config

```bash
skillbox config get
skillbox config set --default-scope user
skillbox config set --default-agent claude --default-agent cursor
skillbox config set --add-agent codex
skillbox config set --install-mode symlink
skillbox config set --install-mode copy
```

Config defaults live in `~/.config/skillbox/config.json`:

- `defaultScope`: `project` (default) or `user`
- `defaultAgents`: empty array means all agents
- `installMode`: `symlink` (macOS/Linux) or `copy` (Windows)

## Agent Mode

Use `--json` for machine-readable output.

```bash
skillbox list --json
skillbox status --json
skillbox update linting --json
```

### Agent Usage Snippet

```text
Use skillbox for skill management.

Common workflow:
1) skillbox list --json
2) skillbox status --json
3) skillbox update <name> --json

If you need to install a new skill from a URL, run:
skillbox add <url> [--name <name>]

If you need a skill from a repo, run:
skillbox add owner/repo --list
skillbox add owner/repo --skill <name>
skillbox add owner/repo --yes

If a URL is not a valid skill, run:
skillbox convert <url> --agent
```

## Skill Locations

Skillbox maintains a canonical store and syncs into agent-native folders.

Canonical store:

- `~/.config/skillbox/skills/<name>/`

Index + config:

- `~/.config/skillbox/index.json`
- `~/.config/skillbox/projects.json`
- `~/.config/skillbox/config.json`

Agent paths (default):

- OpenCode: `.opencode/skills/`, `~/.config/opencode/skills/` (Claude-compatible `.claude/skills/` also supported)
- Claude: `.claude/skills/`, `~/.claude/skills/`
- Cursor: `.cursor/skills/`, `.claude/skills/`, `~/.cursor/skills/`, `~/.claude/skills/`
- Codex: `$REPO_ROOT/.codex/skills/`, `~/.codex/skills/`
- Amp: `.agents/skills/`, `~/.config/agents/skills/` (Claude-compatible `.claude/skills/` also supported)
- Antigravity: `.agent/skills/`, `~/.gemini/antigravity/skills/`

## Usage with AI Agents

### Just ask the agent

The simplest approach is to instruct your agent to use Skillbox:

```
Use skillbox to manage skills for this repo. Run skillbox --help for all commands.
```

### AGENTS.md / CLAUDE.md

Add this to your project instructions for more consistent results:

```markdown
## Skills

Use `skillbox` to manage skills. Run `skillbox --help` for all commands.

Core workflow:

1. `skillbox list --json`
2. `skillbox status --json`
3. `skillbox update <name> --json`
```

## Development

```bash
git clone https://github.com/christiananagnostou/skillbox
cd skillbox
npm install
npm run build
npm link
```

## License

MIT
