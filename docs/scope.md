# Scope Model (User vs Project)

Skillbox supports two scopes:

- Project scope: skills are installed in project-specific agent folders.
- User scope (global, factory default): skills are installed in user-level agent folders.

## Defaults

- The configured `defaultScope` chooses the install scope; the factory default is `user`.
- With `defaultScope` set to `project`, the current project determines installation locations.
- Passing --global installs into user scope.

## Canonical Store

The canonical store is always user-level:

- ~/.config/skillbox/skills/<name>/

This canonical copy is used for:

- Update detection
- Source tracking
- Metadata (namespace/categories/tags)

## Project Registry

Project-specific configuration is stored in:

- ~/.config/skillbox/projects.json

Each project entry includes:

- project root path
- agent path overrides
- installed skills

## Shared content, separate install locations

Every installation of a named skill uses the same user-level canonical source.
Symlink installs point directly at that directory; copy installs hold separate copies
that Skillbox synchronizes. Project scope selects installation locations, not an independent
version of the skill.

## Precedence (Agent-Side)

Some agents apply precedence rules (e.g., project overrides user). Skillbox does not change these rules; it only manages file placement.

## CLI Flags

- --global: target user scope
- --agents: override default agents for install/sync

## Updating shared content

Canonical content is shared by all installs of a skill. `update --project PATH` skips skills
that also have installs outside that project, because changing the canonical directory would
otherwise change other scopes through their symlinks. Update without `--project` to update
shared content intentionally. Disabled skills are always skipped.
