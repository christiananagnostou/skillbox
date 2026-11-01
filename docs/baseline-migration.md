# Migrating legacy update baselines

Older Skillbox installations have no complete managed-file baseline. Automatic and manual updates conservatively skip those Git skills, and URL skills with auxiliary files, because Skillbox cannot tell historical local edits from original content.

Use the explicit migration command to compare existing installations with upstream without replacing skill content:

```sh
skillbox migrate-baseline --dry-run --json
skillbox migrate-baseline my-skill --json
skillbox update my-skill --dry-run --json
```

Omitting the name processes all installed remote skills. Local-source skills are skipped. This command deliberately covers the canonical directory and every recorded installation across projects: a canonical baseline is shared across all symlinked scopes. It does not change enabled/disabled state, recreate missing installations, install newly discovered skills, or execute downloaded scripts. It follows existing network timeouts and authentication behavior.

Git migration resolves the tracked ref to one immutable commit, hashes every upstream file including binary assets, and records that commit in its result. URL migration compares the downloaded SKILL.md; it recognizes the one extra newline written by older Skillbox versions only when all other bytes match exactly.

A matching directory becomes eligible for normal update checks. Changed, extra, or deleted files are reported in `locations[].differences` and preserved byte-for-byte. Migration records the upstream baseline, **not the modified local contents**, so those differences remain protected and future updates skip the skill. An older unmodified upstream version can also differ from the current upstream version; migration cannot infer which differences were personal edits. Review and reconcile them manually before updating. Migration never silently blesses a difference as safe to overwrite.

Copied agent installations are compared independently. Canonical symlinks are deduplicated. Missing paths, including removed disabled targets, stay missing. Existing baselines are retained instead of being overwritten. An unavailable or invalid remote fails that skill without replacing assets; remaining skills can still be processed. Baseline files are written atomically per directory, but migration across several directories is not one transaction; rerunning safely skips locations already migrated.

`--dry-run` fetches upstream for comparison but writes no baseline or skill content. A pending interrupted directory publication requires normal recovery first. JSON reports `matched`, `modified`, `missing`, or `existing` for each location, with `snapshot` for Git. `status: migrated` in a dry run means a proposed migration. Nonzero exit and `ok: false` mean at least one migration failed; protected differences are a successful comparison, not a failure.
