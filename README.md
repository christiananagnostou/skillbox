# skillbox

> Local-first, agent-agnostic skills manager. Track, update, and sync skills across popular AI coding agents with one CLI.

[![CI](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml/badge.svg)](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/skillbox.svg)](https://www.npmjs.com/package/skillbox)

## Installation

### npm (recommended)

```bash
npm install -g skillbox
```

### From Source

```bash
git clone https://github.com/christiananagnostou/skillbox
cd skillbox
npm install
npm run build
npm link --global
```

## CI

```bash
npm run lint:ci
npm run format:check
npm run build
```


## Quick Start

```bash
skillbox add https://example.com/skills/linting/SKILL.md
skillbox list
skillbox status
skillbox update linting
```

## Commands

### Core Commands

```bash
skillbox add <url> [--name <name>] [--global] [--agents ...]
skillbox convert <url> [--name <name>] [--output <dir>] [--agent]
skillbox list [--group=category|namespace|source|project] [--json]
skillbox status [--group=project|source] [--json]
skillbox update [name] [--system] [--project <path>]
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
skillbox config set --manage-system
```

TODO: Config option reference (defaults, values, validation)

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
- Codex: `$REPO_ROOT/.codex/skills/`, `~/.codex/skills/`, `/etc/codex/skills` (system)
- Amp: `.agents/skills/`, `~/.config/agents/skills/` (Claude-compatible `.claude/skills/` also supported)
- Antigravity: `.agent/skills/`, `~/.gemini/antigravity/skills/`

TODO: Validate agent path list against upstream docs before release

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

### Claude Code Skill

TODO: Provide a Skillbox skill for Claude Code (SKILL.md)

## License

MIT
