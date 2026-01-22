# Skillbox

> Local-first, agent-agnostic skills manager for AI coding agents.

[![CI](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml/badge.svg)](https://github.com/christiananagnostou/skillbox/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/skillbox.svg)](https://www.npmjs.com/package/skillbox)

## Install

```bash
npm install -g skillbox
```

On first run, Skillbox auto-detects your installed agents and configures itself.

**Quick start:** Install the skillbox skill to teach your agent how to manage skills:

```bash
skillbox add christiananagnostou/skillbox
```

## Golden Workflow

These three commands cover most use cases:

```bash
skillbox list              # see installed skills
skillbox status            # check for updates
skillbox update [name]     # update skills
```

## Adding Skills

| Command | Description |
|---------|-------------|
| `skillbox add owner/repo` | Install all skills from a GitHub repo |
| `skillbox add owner/repo --list` | List available skills in a repo |
| `skillbox add owner/repo --skill name` | Install a specific skill from a repo |
| `skillbox add <url>` | Install skill from a direct URL |
| `skillbox add <url> --name my-skill` | Install with custom name |

> **Note:** GitHub unauthenticated API limit is 60 requests/hour per IP.

## All Commands

### Skills

| Command | Description |
|---------|-------------|
| `skillbox list` | List installed skills |
| `skillbox status` | Check for outdated skills |
| `skillbox update [name]` | Update all or one skill |
| `skillbox remove <name>` | Remove a skill |
| `skillbox import <path>` | Import existing skill directory |
| `skillbox import --global` | Import all skills from agent folders |

### Config

| Command | Description |
|---------|-------------|
| `skillbox config get` | Show current config |
| `skillbox config set --add-agent <name>` | Add an agent |
| `skillbox config set --default-scope <scope>` | Set default scope (`user` or `project`) |
| `skillbox config set --install-mode <mode>` | Set install mode (`symlink` or `copy`) |

### Projects

| Command | Description |
|---------|-------------|
| `skillbox project add <path>` | Register a project and auto-import skills from its `skills/` directory |
| `skillbox project list` | List registered projects |
| `skillbox project inspect <path>` | Show project details and skills |
| `skillbox project sync <path>` | Re-sync skills to a project |

## Supported Agents

| Agent | User Path | Project Path |
|-------|-----------|--------------|
| Claude | `~/.claude/skills/` | `.claude/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| Codex | `~/.codex/skills/` | `.codex/skills/` |
| OpenCode | `~/.config/opencode/skills/` | `.opencode/skills/` |
| Amp | `~/.config/agents/skills/` | `.agents/skills/` |
| Antigravity | `~/.gemini/antigravity/skills/` | `.agent/skills/` |

## JSON Mode

All commands support `--json` for machine-readable output:

```bash
skillbox list --json
skillbox status --json
skillbox update my-skill --json
```

## For AI Agents

Install the skillbox skill to teach your agent how to use skillbox:

```bash
skillbox add christiananagnostou/skillbox
```

Or add this to your `CLAUDE.md` / `AGENTS.md`:

```markdown
Use `skillbox` to manage skills. Run `skillbox --help` for commands.
```

## File Locations

| Path | Purpose |
|------|---------|
| `~/.config/skillbox/skills/` | Canonical skill store |
| `~/.config/skillbox/config.json` | Configuration |
| `~/.config/skillbox/index.json` | Skill index |

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
