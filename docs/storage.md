# Storage Strategy (Symlink Mode)

This document describes how Skillbox stores skills and how agent folders are linked.

## Canonical Store

Skillbox treats `~/.config/skillbox/skills/<name>/` as the single source of truth. All writes go here first.

## Agent Folders

Agent-specific skill folders are linked to the canonical store:

- On macOS/Linux, Skillbox creates a symlink from the agent folder to the canonical skill folder.
- On Windows, Skillbox falls back to a full copy automatically.

If symlink creation fails on Unix, Skillbox logs a warning and skips the install unless `skillbox config set --install-mode copy` is used.

## installMode

`installMode` controls how skills are synced into agent folders (set with `skillbox config set --install-mode <mode>`):

- `symlink` (default on Unix/macOS): create symlinks to the canonical store.
- `copy` (default on Windows): copy files into agent folders.

Set via:

```bash
skillbox config set --install-mode symlink
skillbox config set --install-mode copy
```

## Status and Updates

Updates always write into the canonical store first. Agent folders reflect those updates via symlinks or fresh copies, depending on `installMode`.

## Notes

- System scope paths are not supported.
- Existing skills in agent folders are discovered via `skillbox list` and can be imported with `skillbox import --global`.
