# Skillbox Manual Testing Guide

This document describes the manual testing process for validating skillbox functionality. Run this suite after significant changes to verify everything works correctly.

## Prerequisites

```bash
nvm use 22
npm run build
npm link
```

Verify installation:
```bash
skillbox --version
```

## Test Suite

### 1. Basic Commands

```bash
# Config
skillbox config get --json

# List (verify no duplicates, correct agent tracking)
skillbox list --json

# Status
skillbox status --json
```

**Expected:**
- Config shows `defaultAgents`, `defaultScope`, `installMode`
- List shows skills without duplicates
- Each skill has correct `agent` field (not "unknown")
- Status shows outdated/up-to-date counts

### 2. Adding Skills from Repository

Test repo: `vercel-labs/agent-skills`

```bash
# List available skills
skillbox add vercel-labs/agent-skills --list

# Install a skill from repo
skillbox add vercel-labs/agent-skills --skill react-best-practices --json

# Verify it appears in list with [git] source
skillbox list
```

**Expected:**
- `--list` shows available skills in repo
- Skill installs successfully
- Appears in list with `[git]` source type

### 3. Adding Skills from URL

```bash
# Add skill from raw URL
skillbox add 'https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/claude.ai/vercel-deploy-claimable/SKILL.md' --json

# Verify it appears with [url] source
skillbox list
```

**Expected:**
- Skill installs from URL
- Appears in list with `[url]` source type

### 4. Update Command

```bash
# Update a specific git-sourced skill
skillbox update react-best-practices --json

# Update all skills
skillbox update --json
```

**Expected:**
- Returns success with list of updated skills
- Git/URL skills fetch latest content

### 5. Remove Command

```bash
# Remove a skill
skillbox remove react-best-practices --json

# Verify removal
skillbox list
```

**Expected:**
- Skill removed from index
- Skill removed from agent folders
- No longer appears in list

### 6. Import from Path

```bash
# Create test skill
mkdir -p /tmp/skillbox-test/test-skill
cat > /tmp/skillbox-test/test-skill/SKILL.md << 'EOF'
---
name: test-import-skill
description: A test skill for validating the import command
---

# Test Import Skill

This is a test skill.
EOF

# Import it
skillbox import /tmp/skillbox-test/test-skill --json

# Verify
skillbox list

# Cleanup
skillbox remove test-import-skill
rm -rf /tmp/skillbox-test
```

**Expected:**
- Import succeeds with skill name and path
- Skill appears in list with `[local]` source

### 7. Import --global (User Skills Discovery)

```bash
# Create untracked skill directly in agent folder
mkdir -p ~/.claude/skills/untracked-test-skill
cat > ~/.claude/skills/untracked-test-skill/SKILL.md << 'EOF'
---
name: untracked-test-skill
description: Untracked skill for testing --global import
---

# Untracked Test Skill

Placed directly in agent folder.
EOF

# Run global import
skillbox import --global --json

# Verify - should show imported and skipped lists
skillbox list

# Cleanup
skillbox remove untracked-test-skill
rm -rf ~/.claude/skills/untracked-test-skill
```

**Expected:**
- `imported` contains new skill
- `skipped` contains already-tracked skills
- Respects `defaultAgents` config (only scans configured agent paths)
- Records correct agent (e.g., "claude", not "unknown")

### 8. Import from Project Folder

```bash
# Create skill in project folder
mkdir -p .claude/skills/project-test-skill
cat > .claude/skills/project-test-skill/SKILL.md << 'EOF'
---
name: project-test-skill
description: Project-level test skill
---

# Project Test Skill

A skill in project .claude/skills/ folder.
EOF

# Import it
skillbox import .claude/skills/project-test-skill --json

# Verify
skillbox list

# Cleanup
skillbox remove project-test-skill
rm -rf .claude/skills/project-test-skill
rmdir .claude/skills 2>/dev/null
rmdir .claude 2>/dev/null
```

**Expected:**
- Import succeeds
- Skill appears in list

### 9. Config Respect (defaultAgents)

This verifies the fix for duplicate skills when multiple agents share paths.

```bash
# Check config
skillbox config get

# If defaultAgents is set (e.g., ["claude"]), list should not show duplicates
# even though paths like ~/.claude/skills are shared by multiple agents
skillbox list

# Count should match actual unique skills, not multiplied by agent count
```

**Expected:**
- If `defaultAgents: ["claude"]`, only claude paths are scanned
- No duplicate skills in output

## Full Cleanup

After testing, restore to original state:

```bash
# Remove any test skills that may remain
skillbox remove test-import-skill 2>/dev/null
skillbox remove untracked-test-skill 2>/dev/null
skillbox remove project-test-skill 2>/dev/null
skillbox remove react-best-practices 2>/dev/null
skillbox remove web-design-guidelines 2>/dev/null
skillbox remove vercel-deploy-claimable 2>/dev/null

# Remove test directories
rm -rf /tmp/skillbox-test
rm -rf ~/.claude/skills/untracked-test-skill
rm -rf .claude/skills/project-test-skill
rmdir .claude/skills 2>/dev/null
rmdir .claude 2>/dev/null

# Verify clean state
skillbox list
```

## Quick Smoke Test

For a fast verification after changes:

```bash
nvm use 22 && npm run build && npm link
skillbox --version
skillbox list
skillbox status
skillbox add vercel-labs/agent-skills --list
```

## CI Notes

- Tests require Node 22+
- Tests modify `~/.config/skillbox/index.json`
- Tests create/remove files in `~/.claude/skills/`
- Network access required for repo/URL tests
