# Scope Model (User vs Project)

Skillbox supports two scopes:

- Project scope (default): skills are installed in project-specific agent folders.
- User scope (global): skills are installed in user-level agent folders.

## Defaults

- Running skillbox inside a project installs into project scope.
- Passing --global installs into user scope.

## Canonical Store

The canonical store is always user-level:

- ~/.skillbox/skills/<name>/

This canonical copy is used for:

- Update detection
- Source tracking
- Metadata (namespace/categories/tags)

## Project Registry

Project-specific configuration is stored in:

- ~/.skillbox/projects.json

Each project entry includes:

- project root path
- agent path overrides
- installed skills
- optional link-to-global flag

## Linking Project Skills to Global

Project skills are separate by default. A project can optionally link to the global canonical store for automatic updates. This allows:

- Shared sources, but separate project install locations
- Global update workflow without per-project fetch

Implementation note:

- A link stores a pointer to the canonical store and syncs from it.

## System Scope

Codex supports /etc/codex/skills. Skillbox lists these by default but does not modify them unless --system is passed.

## Precedence (Agent-Side)

Some agents apply precedence rules (e.g., project overrides user). Skillbox does not change these rules; it only manages file placement.

## CLI Flags

- --global: target user scope
- --agents: override default agents for install/sync
- --system: allow system-scope updates
