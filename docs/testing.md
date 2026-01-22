# Skillbox Manual Testing Guide

This document describes the manual testing process for validating skillbox functionality. Run this suite after significant changes to verify everything works correctly.

> **Important:** When making changes to skillbox, update this testing document to cover any new commands, flags, or behaviors. This ensures we maintain 100% test coverage.

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

## Command Reference

All commands and flags that must be tested:

| Command | Flags |
|---------|-------|
| `add <url>` | `--name`, `--global`, `--agents`, `--skill`, `--list`, `--json` |
| `remove <name>` | `--project`, `--json` |
| `update [name]` | `--project`, `--json` |
| `list` | `--json`, `--global`, `--agents` |
| `import [path]` | `--global`, `--agents`, `--json` |
| `status` | `--json` |
| `config get` | `--json` |
| `config set` | `--default-agent`, `--add-agent`, `--default-scope`, `--install-mode`, `--json` |
| `project add <path>` | `--agent-path`, `--json` |
| `project list` | `--json` |
| `project inspect <path>` | `--json` |
| `project sync <path>` | `--json` |
| `meta set <name>` | `--category`, `--tag`, `--namespace`, `--json` |
| `convert <url>` | `--name`, `--output`, `--agent`, `--json` |
| `agent` | `--json` |

## Test Suite

### 1. Basic Commands

```bash
# Config
skillbox config get --json

# List (verify no duplicates, correct agent tracking)
skillbox list --json

# Status
skillbox status --json

# Agent usage info
skillbox agent --json
```

**Expected:**
- Config shows `defaultAgents`, `defaultScope`, `installMode`
- List shows skills without duplicates
- Each skill has correct `agent` field (not "unknown")
- Status shows outdated/up-to-date counts
- Agent shows usage instructions

### 2. Adding Skills from Repository

Test repo: `vercel-labs/agent-skills`

```bash
# List available skills
skillbox add vercel-labs/agent-skills --list

# Install a skill from repo
skillbox add vercel-labs/agent-skills --skill web-design-guidelines --json

# Verify it appears in list with [git] source and symlink exists
skillbox list
ls -la ~/.claude/skills/web-design-guidelines
```

**Expected:**
- `--list` shows available skills in repo
- Skill installs successfully
- Appears in list with `[git]` source type
- Symlink points to `~/.config/skillbox/skills/<skillname>`

### 3. Adding Skills from URL

```bash
# Add skill from raw URL
skillbox add 'https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/claude.ai/vercel-deploy-claimable/SKILL.md' --json

# Verify it appears with [url] source and symlink exists
skillbox list
ls -la ~/.claude/skills/vercel-deploy-claimable
```

**Expected:**
- Skill installs from URL
- Appears in list with `[url]` source type
- Symlink points to `~/.config/skillbox/skills/<skillname>`

### 4. Add with --name Override

```bash
# Add skill with custom name
skillbox add 'https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md' --name my-custom-name --json

# Verify custom name is used
skillbox list | grep my-custom-name
ls -la ~/.claude/skills/my-custom-name

# Cleanup
skillbox remove my-custom-name
```

**Expected:**
- Skill installed with custom name `my-custom-name`
- Symlink created at `~/.claude/skills/my-custom-name`

### 5. Add with --global Flag

```bash
# Add skill explicitly to user scope
skillbox add vercel-labs/agent-skills --skill react-best-practices --global --json

# Verify install is user-scoped
skillbox list --json | grep -A5 react-best-practices

# Cleanup
skillbox remove react-best-practices
```

**Expected:**
- Skill installed to user scope
- Install path shows `scope: "user"`

### 6. Add with --agents Flag

```bash
# Add skill for specific agent
skillbox add vercel-labs/agent-skills --skill react-best-practices --agents claude --json

# Verify only claude agent path used
skillbox list --json | grep -A10 react-best-practices

# Cleanup
skillbox remove react-best-practices
```

**Expected:**
- Skill installed only to specified agent paths
- Install shows `agent: "claude"`

### 7. Update Command

```bash
# Update a specific git-sourced skill
skillbox update web-design-guidelines --json

# Update all skills
skillbox update --json

# Verify symlink still exists after update
ls -la ~/.claude/skills/web-design-guidelines
```

**Expected:**
- Returns success with list of updated skills
- Git/URL skills fetch latest content
- Symlinks preserved after update

### 8. Update with --project Flag

```bash
# Setup: Add skill to a project
mkdir -p /tmp/test-project
cd /tmp/test-project
skillbox project add . --json
skillbox add vercel-labs/agent-skills --skill react-best-practices --json

# Update only for this project
skillbox update react-best-practices --project /tmp/test-project --json

# Cleanup
cd -
skillbox remove react-best-practices
rm -rf /tmp/test-project
```

**Expected:**
- Only project-scoped installs are updated
- User-scoped installs unchanged

### 9. Remove Command

```bash
# Remove a skill
skillbox remove web-design-guidelines --json

# Verify removal
skillbox list | grep web-design-guidelines || echo "Removed successfully"
ls ~/.claude/skills/web-design-guidelines 2>/dev/null || echo "Symlink removed"
```

**Expected:**
- Skill removed from index
- Skill removed from agent folders
- Symlink deleted
- No longer appears in list

### 10. Remove with --project Flag

```bash
# Setup: Add skill to project
mkdir -p /tmp/test-project
cd /tmp/test-project
skillbox project add . --json
skillbox add vercel-labs/agent-skills --skill web-design-guidelines --json
cd -

# Also add to user scope
skillbox add vercel-labs/agent-skills --skill web-design-guidelines --global --json

# Remove only from project
skillbox remove web-design-guidelines --project /tmp/test-project --json

# Verify user install still exists
skillbox list | grep web-design-guidelines

# Full cleanup
skillbox remove web-design-guidelines
rm -rf /tmp/test-project
```

**Expected:**
- Only project install removed
- User-scoped install preserved

### 11. List with --global Flag

```bash
# List only user-scope skills
skillbox list --global

# Compare with full list
skillbox list
```

**Expected:**
- `--global` shows only user-scoped skills
- Project skills not shown

### 12. List with --agents Flag

```bash
# List skills for specific agent
skillbox list --agents claude

# Try with multiple agents
skillbox list --agents claude,cursor
```

**Expected:**
- Only shows skills installed to specified agents
- Multiple agents comma-separated

### 13. Import from Path

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
skillbox list | grep test-import-skill

# Cleanup
skillbox remove test-import-skill
rm -rf /tmp/skillbox-test
```

**Expected:**
- Import succeeds with skill name and path
- Skill appears in list with `[local]` source

### 14. Import --global (User Skills Discovery)

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
skillbox list | grep untracked-test-skill

# Cleanup
skillbox remove untracked-test-skill
rm -rf ~/.claude/skills/untracked-test-skill
```

**Expected:**
- `imported` contains new skill
- `skipped` contains already-tracked skills
- Respects `defaultAgents` config (only scans configured agent paths)
- Records correct agent (e.g., "claude", not "unknown")

### 15. Import with --agents Flag

```bash
# Create untracked skill
mkdir -p ~/.claude/skills/agent-filter-test
cat > ~/.claude/skills/agent-filter-test/SKILL.md << 'EOF'
---
name: agent-filter-test
description: Test import with agent filter
---
Test skill.
EOF

# Import only scanning claude agent
skillbox import --global --agents claude --json

# Cleanup
skillbox remove agent-filter-test
rm -rf ~/.claude/skills/agent-filter-test
```

**Expected:**
- Only specified agent paths scanned
- Skill imported with correct agent

### 16. Import from Project Folder

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
skillbox list | grep project-test-skill

# Cleanup
skillbox remove project-test-skill
rm -rf .claude/skills/project-test-skill
rmdir .claude/skills 2>/dev/null
rmdir .claude 2>/dev/null
```

**Expected:**
- Import succeeds
- Skill appears in list

### 17. Config Set Commands

```bash
# Save current config
skillbox config get --json > /tmp/config-backup.json

# Test --default-scope
skillbox config set --default-scope project --json
skillbox config get | grep defaultScope

# Test --install-mode
skillbox config set --install-mode copy --json
skillbox config get | grep installMode

# Test --add-agent
skillbox config set --add-agent cursor --json
skillbox config get | grep -A3 defaultAgents

# Test --default-agent (replaces list)
skillbox config set --default-agent claude --json
skillbox config get | grep -A3 defaultAgents

# Restore original config
skillbox config set --default-scope user --install-mode symlink --json
```

**Expected:**
- Each setting updates correctly
- `--add-agent` appends to list
- `--default-agent` replaces list
- Changes persist

### 18. Project Commands

```bash
# Create test project
mkdir -p /tmp/test-project/skills/my-project-skill
cat > /tmp/test-project/skills/my-project-skill/SKILL.md << 'EOF'
---
name: my-project-skill
description: A project skill
---
Project skill content.
EOF

# Register project (should auto-discover skills)
skillbox project add /tmp/test-project --json

# List projects
skillbox project list --json

# Inspect project
skillbox project inspect /tmp/test-project --json

# Add a skill to the project
skillbox add vercel-labs/agent-skills --skill web-design-guidelines --json

# Sync project skills
skillbox project sync /tmp/test-project --json

# Cleanup
skillbox remove my-project-skill
skillbox remove web-design-guidelines
rm -rf /tmp/test-project
```

**Expected:**
- `project add` registers project and discovers skills in skills/ directory
- `project list` shows all registered projects with skill counts
- `project inspect` shows project details and skills
- `project sync` copies skills to install paths

### 19. Project Add with --agent-path

```bash
# Create project with custom agent path
mkdir -p /tmp/test-project/custom-skills
skillbox project add /tmp/test-project --agent-path claude=/tmp/test-project/custom-skills --json

# Verify custom path registered
skillbox project inspect /tmp/test-project --json | grep custom-skills

# Cleanup
rm -rf /tmp/test-project
```

**Expected:**
- Custom agent path registered for project
- Shows in project inspect output

### 20. Meta Set Command

```bash
# Add a test skill first
skillbox add vercel-labs/agent-skills --skill web-design-guidelines --json

# Set metadata
skillbox meta set web-design-guidelines --category design --json
skillbox meta set web-design-guidelines --tag frontend --tag ui --json
skillbox meta set web-design-guidelines --namespace vercel --json

# Verify metadata (check skill.json in store)
cat ~/.config/skillbox/skills/web-design-guidelines/skill.json

# Cleanup
skillbox remove web-design-guidelines
```

**Expected:**
- Category, tags, namespace saved to skill metadata
- Metadata persists in skill.json

### 21. Convert Command

```bash
# Convert a URL to skill format (delegates to agent by default)
skillbox convert 'https://example.com/some-doc' --name converted-skill --output /tmp/converted --json

# With --agent flag for agent-assisted conversion
skillbox convert 'https://example.com/some-doc' --agent --json
```

**Expected:**
- Creates skill structure in output directory
- `--agent` flag triggers agent-assisted conversion

### 22. Config Respect (defaultAgents)

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

### 23. Subcommands Display

Skills with multiple .md files should show subcommands.

```bash
# Verify subcommands appear for skills that have them
skillbox list

# Example: clean-code should show → debug, duplicates, slop, unused
```

**Expected:**
- Skills with multiple .md files show `→ subcommand1, subcommand2, ...`
- Only SKILL.md excluded from subcommand list

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
skillbox remove my-custom-name 2>/dev/null
skillbox remove agent-filter-test 2>/dev/null
skillbox remove my-project-skill 2>/dev/null
skillbox remove converted-skill 2>/dev/null

# Remove test directories
rm -rf /tmp/skillbox-test
rm -rf /tmp/test-project
rm -rf /tmp/converted
rm -rf ~/.claude/skills/untracked-test-skill
rm -rf ~/.claude/skills/agent-filter-test
rm -rf .claude/skills/project-test-skill
rmdir .claude/skills 2>/dev/null
rmdir .claude 2>/dev/null

# Restore config defaults
skillbox config set --default-scope user --install-mode symlink --default-agent claude --json

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

## Maintaining This Document

When making changes to skillbox:

1. **New commands**: Add a new test section covering all flags
2. **New flags**: Add tests to the relevant command section
3. **Bug fixes**: Add a regression test if applicable
4. **Behavior changes**: Update expected outputs

Run the full test suite before merging PRs to ensure nothing breaks.
