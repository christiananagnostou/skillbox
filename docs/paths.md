# Skill Paths (User + Project)

This document lists the skill directories used by each supported agent. These defaults are used for both discovery and install targets unless overridden by config.

## OpenCode

Source: https://opencode.ai/docs/skills/

Project scope:
- .opencode/skills/<name>/SKILL.md
- .claude/skills/<name>/SKILL.md (compat)

User scope:
- ~/.config/opencode/skills/<name>/SKILL.md
- ~/.claude/skills/<name>/SKILL.md (compat)

Discovery:
- Walks upward from CWD to repo root, scanning .opencode/skills and .claude/skills.

## Claude Code

Source: https://code.claude.com/docs/en/skills

Project scope:
- .claude/skills/<name>/SKILL.md

User scope:
- ~/.claude/skills/<name>/SKILL.md

Discovery:
- Supports nested .claude/skills directories in monorepos.

## Cursor

Source: https://cursor.com/docs/context/skills

Project scope:
- .cursor/skills/<name>/SKILL.md
- .claude/skills/<name>/SKILL.md (compat)

User scope:
- ~/.cursor/skills/<name>/SKILL.md
- ~/.claude/skills/<name>/SKILL.md (compat)

## Codex (OpenAI)

Source: https://developers.openai.com/codex/skills/

Project scope:
- $CWD/.codex/skills/<name>/SKILL.md
- $CWD/../.codex/skills/<name>/SKILL.md
- $REPO_ROOT/.codex/skills/<name>/SKILL.md (install target)

User scope:
- ~/.codex/skills/<name>/SKILL.md

System scope:
- /etc/codex/skills/<name>/SKILL.md (read-only unless --system)

## Amp

Source: https://ampcode.com/news/agent-skills

Project scope:
- .agents/skills/<name>/SKILL.md
- .claude/skills/<name>/SKILL.md (compat)

User scope:
- ~/.config/agents/skills/<name>/SKILL.md
- ~/.claude/skills/<name>/SKILL.md (compat)

## Antigravity

Source: internal spec provided by user

Project scope:
- .agent/skills/<name>/SKILL.md

User scope:
- ~/.gemini/antigravity/skills/<name>/SKILL.md

## Notes

- All agents expect a folder per skill containing SKILL.md.
- Skillbox uses a canonical store and copies into these locations.
- Skillbox supports per-project overrides for agent path mappings.