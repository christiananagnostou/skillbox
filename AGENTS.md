# Skillbox Agent Guide

This file is for agentic coding tools operating in this repo. Keep output deterministic, prefer JSON modes, and follow existing conventions.

## Build, Lint, Format, Test

This project uses the Oxc suite for linting and formatting.

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
npm run lint:fix
npm run lint:ci
```

### Format

```bash
npm run format
npm run format:check
```

### Tests

TODO: Add test runner and single-test commands

## Code Style Guidelines

### Language and Runtime

- TypeScript, ES modules, Node.js.
- Use async/await for I/O; avoid synchronous filesystem calls.

### Imports

- Use named imports and explicit module paths.
- Group imports: built-ins, external deps, local modules.
- Keep type-only imports with `import type`.

### Formatting

- Use oxfmt via `npm run format`.
- Target print width is 100.
- Use double quotes in TypeScript files (oxfmt default).

### Types

- Prefer explicit return types on exported functions.
- Avoid `any`; use narrow unions and helper types.
- Use `type` for aliases; use `interface` only when extending public shapes.

### Naming

- Files: kebab-case for new modules under `src/lib` or `src/commands`.
- Functions: verb-first (`loadConfig`, `resolveRuntime`).
- Constants: `camelCase` for values, `UPPER_SNAKE` only for compile-time constants.

### Error Handling

- Use `handleCommandError` for CLI command errors.
- Return JSON errors when `--json` is set.
- Throw `Error` with clear, user-facing messages.

### CLI Patterns

- Commands should support `--json` output.
- Use shared helpers: `handleCommandError`, `printList`, `printGroupList`, `grouping` utilities.
- Keep output stable and concise for agent usage.

### Data and Paths

- Config and indexes live in `~/.config/skillbox/`.
- Canonical skills live in `~/.config/skillbox/skills/<name>/`.
- Use `src/lib/paths.ts` for all path resolution.

### Project Scoping

- Default scope is `project` unless `--global` or config overrides.
- Use `resolveRuntime` and `ensureProjectRegistered` to resolve scope.
- Use `buildProjectAgentPaths` for agent path overrides.

### Parsing and Metadata

- Skill metadata is stored in `skill.json` alongside `SKILL.md`.
- Use `parseSkillMarkdown` and `buildMetadata` when generating skills.

### JSON Output

- All JSON responses must include `ok` and `command` fields.
- For errors, include `{ error: { message } }`.

### CI Notes

- CI runs oxlint, oxfmt, and `npm run build`.
- Add new scripts to `package.json` and keep CI in sync.

## Repository Conventions

- Avoid new tooling unless required.
- Add TODOs for missing pieces (tests, registry, etc.).
- Keep documentation in `docs/` aligned with CLI behavior.

## Cursor / Copilot Rules

- None found in `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`.
