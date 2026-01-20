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

Skillbox will detect installed agents on your machine. Repo and URL installs can track their origin so your skills always stay up to date.

> Tip: run `skillbox list` right after install to see existing skills.

Skillbox links agent folders to the canonical store using symlinks on macOS/Linux and file copies on Windows.

```bash
# add skill from URL
skillbox add https://example.com/skills/linting/SKILL.md
# list skills in repo
skillbox add owner/repo --list
# install single repo skill
skillbox add owner/repo --skill linting
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
