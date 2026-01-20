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

Skillbox will detect installed agents on your machine. Repo and URL installs track their origin so updates stay one command away.

> Tip: run `skillbox list` right after install to see existing skills.

Skillbox links agent folders to the canonical store using symlinks on macOS/Linux and file copies on Windows.

```bash
# install all repo skills
skillbox add owner/repo
# list skills in repo
skillbox add owner/repo --list
# install single repo skill
skillbox add owner/repo --skill linting
# add skill from URL
skillbox add https://example.com/skills/linting/SKILL.md
# list installed skills
skillbox list
# check for updates
skillbox status
# update one skill
skillbox update linting
```

Notes:
- GitHub unauthenticated API limit: 60 req/hr per IP
- use `skillbox convert` for non-skill URLs

## Commands

### Core Commands

```bash
# add skill from URL
skillbox add <url> [--name <name>] [--global] [--agents ...]
# add skill(s) from repo
skillbox add <repo> [--list] [--skill <name>] [--global] [--agents ...]
# convert content to skill
skillbox convert <url> [--name <name>] [--output <dir>] [--agent]
# list skills
skillbox list [--group=category|namespace|source|project] [--json]
# check for updates
skillbox status [--group=project|source] [--json]
# update skills
skillbox update [name] [--project <path>]
# remove skills
skillbox remove <name> [--project <path>]
# import existing skills
skillbox import <path>
# update metadata
skillbox meta set <name> --category foo --tag bar --namespace baz
# open agent REPL
skillbox agent
```

### Project Commands

```bash
# register project
skillbox project add <path> [--agent-path agent=path]
# list projects
skillbox project list
# show project details
skillbox project inspect <path>
# resync project skills
skillbox project sync <path>
```

### Config

```bash
# show config
skillbox config get
# set default scope
skillbox config set --default-scope user
# replace default agents
skillbox config set --default-agent claude --default-agent cursor
# add default agent
skillbox config set --add-agent codex
# use symlink installs
skillbox config set --install-mode symlink
# use file copies
skillbox config set --install-mode copy
```

Config defaults live in `~/.config/skillbox/config.json`:

- `defaultScope`: `user` (default) or `project`
- `defaultAgents`: empty array means all agents
- `installMode`: `symlink` (macOS/Linux) or `copy` (Windows)

## Agent Mode

Use `--json` for machine-readable output.

```bash
# list skills (json)
skillbox list --json
# status check (json)
skillbox status --json
# update one skill (json)
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
# add skill from URL
skillbox add <url> [--name <name>]

If you need a skill from a repo, run:
# list skills in repo
skillbox add owner/repo --list
# install single repo skill
skillbox add owner/repo --skill <name>
# install all repo skills
skillbox add owner/repo

Note: GitHub unauthenticated API limits are 60 requests per hour per IP, so heavy repo usage may hit rate limits.

If a URL is not a valid skill, run:
# convert content to skill
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
