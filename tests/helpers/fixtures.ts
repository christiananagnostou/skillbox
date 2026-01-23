/**
 * Test fixtures for skillbox tests
 */

export const VALID_SKILL_MARKDOWN = `---
name: test-skill
description: A test skill for automated testing
---

# Test Skill

This is a test skill used for automated testing.

## Usage

Just a test.
`;

export const VALID_SKILL_WITH_SUBCOMMANDS = `---
name: multi-skill
description: A skill with multiple subcommands
---

# Multi Skill

A skill with subcommands.
`;

export const SUBCOMMAND_ONE = `---
name: one
description: Subcommand one
---

# Subcommand One

First subcommand.
`;

export const SUBCOMMAND_TWO = `---
name: two
description: Subcommand two
---

# Subcommand Two

Second subcommand.
`;

export const SKILL_MISSING_NAME = `---
description: A skill without a name
---

# Unnamed Skill

This skill has no name in frontmatter.
`;

export const SKILL_MISSING_DESCRIPTION = `---
name: no-description
---

# No Description

This skill has no description.
`;

export const SKILL_NO_FRONTMATTER = `# Plain Skill

This skill has no YAML frontmatter at all.
`;

export const SKILL_WITH_METADATA = `---
name: metadata-skill
description: A skill with full metadata
categories:
  - testing
  - automation
tags:
  - ci
  - test
namespace: skillbox-tests
---

# Metadata Skill

A skill with full metadata for testing.
`;

export const MINIMAL_SKILL = `---
name: minimal
description: Minimal valid skill
---
Content.
`;

/**
 * Create skill content with custom name and description
 */
export function createSkillContent(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

# ${name}

${description}
`;
}

/**
 * Test repo configurations
 */
export const TEST_REPOS = {
  agentSkills: {
    owner: "vercel-labs",
    repo: "agent-skills",
    skills: ["web-design-guidelines", "react-best-practices", "vercel-deploy-claimable"],
  },
  agentBrowser: {
    owner: "vercel-labs",
    repo: "agent-browser",
    path: "skills/agent-browser",
    skills: ["agent-browser"],
  },
};

/**
 * Test URLs
 */
export const TEST_URLS = {
  validSkill:
    "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md",
  validSkillWithPath:
    "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md",
  invalidUrl: "https://example.com/not-a-skill.md",
};
