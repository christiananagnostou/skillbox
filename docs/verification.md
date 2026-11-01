# Skillbox verification record

Verified in the Linux cloud workspace on 2026-11-01 with Node v24.19.0. Repository:
`https://github.com/christiananagnostou/skillbox.git`; starting checkout
`1d273e1fe3a2ab0a3b3e706a927caa0227775fbc`, version 0.3.7. This record captures local verification before draft PR publication. No scheduler, external
recurring bot or release was activated.

## Checks and evidence

| Command                                             | Result                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run build`                                     | Exit 0                                                             |
| `npm run lint:ci`                                   | Exit 0                                                             |
| `npm run format:check`                              | Exit 0                                                             |
| `npm test`                                          | Exit 0; 29 files, 224 tests passed                                 |
| `npm run test:offline`                              | Exit 0; 17 files, 143 tests passed                                 |
| `node scripts/verify-clean-package.mjs` after build | Exit 0; 10 packages installed, all 12 subprocess commands exited 0 |
| `git diff --check`                                  | Exit 0                                                             |

The full suite includes older live-network cases; passing it is not proof of exhaustive
GitHub authentication, throttling or outage coverage. The dedicated offline suite uses
controlled fixtures and unconditional assertions. Vitest isolates files to prevent mocks
leaking between suites. CLI helpers use temporary HOME/USERPROFILE, remove inherited
GitHub credentials and host settings, set a temporary GH_CONFIG_DIR, and disable environment
reinheritance. Explicit fixture credentials remain available to tests that need them.

Full-suite output is available in `/tmp/skillbox-full-delivery.log`, offline output in
`/tmp/skillbox-offline-delivery.log`, and clean-install JSON in
`/tmp/skillbox-clean-delivery.json` in this execution environment. Reproduce the clean
install with `npm run test:package` (which builds first).

## Coverage of the completed changes

- Built CLI and packed artifact: copy/symlink add, show, list, update, disable, enable and
  remove; actual installed bytes; help/version/parser errors and lock cleanup; truthful
  JSON/nonzero failure exits; failed download retains prior content.
- Complete Git snapshots: immutable commits, nested and binary files, removed/renamed
  upstream files, path and truncated-tree rejection, staged publication and target failures.
- Full-tree status: detects auxiliary additions, changes and deletions with unchanged
  SKILL.md. Missing or locally divergent baselines report unknown, never up-to-date.
- [Baseline migration](baseline-migration.md): explicit dry run and application, immutable
  upstream hashes, binary/add/delete differences preserved, copied targets, shared symlink
  deduplication, disabled missing targets, unreachable upstream and malformed manifests.
- Mutation recovery: actual subprocess SIGKILL at three publication boundaries, competing
  reclaimers, live/permission-denied/foreign/legacy/uncertain lock preservation. Automatic
  dead-owner reclamation requires matching Linux host, boot and PID namespace plus ESRCH.
- Local-edit and ownership protection: re-add cannot replace changed canonical content or
  bypass shared scopes; copy replacement rejects untracked or differing targets. Clean
  legacy local synchronization accepts identical trees, with only the historical extra
  SKILL.md newline allowed when verified against the indexed checksum.
- Automatic update policy and scheduler adapters: disabled defaults, interval gating,
  pins/exclusions, dry run, sanitized bounded history, failure backoff, registration cleanup,
  quoted native plans and disable verification. Linux removal checks both disabled and
  inactive states. Tests inject executors; they do not install native jobs.
- Credentials: GitHub CLI lookup explicitly targets github.com, redirects are bounded,
  cross-origin redirects permanently strip credentials, and public/HTTP sources receive
  no GitHub authorization header. Enterprise host/token fixture tests verify isolation.

Independent review examined data loss, credential exposure, scheduler removal, shared
scopes and local-edit detection. Review findings were fixed and regression-tested; no
remaining blocker was identified for local opt-in delivery. A full-suite regression in
legacy project synchronization was corrected before the final passing run.

## Clean npm installation

The clean-package script packs the built project and installs the tarball into a disposable
local prefix using a fresh npm cache and `--ignore-scripts --omit=dev --no-audit --no-fund`.
It uses actual registry dependencies, not workspace dependency links. It invokes the installed
command shim and CLI, then tests a copy-mode lifecycle against a loopback HTTP fixture.
Temporary files are removed in `finally`; no global installation or downloaded lifecycle
script is involved. Transport proxy/CA settings are retained where required, while npm and
GitHub application credentials are excluded. Fetches have a 30-second timeout and no retries.

The final run installed 10 packages in 2 seconds. All 12 recorded commands exited 0.
Direct dependencies resolved to chalk 5.6.2, commander 15.0.0, terminal-link 5.0.0 and
zod 4.6.7. An earlier attempt lacking the environment's required proxy settings failed DNS;
the corrected isolated harness passed repeatedly.

CI now defines Linux/macOS/Windows offline jobs and a separate Ubuntu clean-package job.
Check the draft PR checks for remote CI results on its exact head commit.

## Remaining release gates and limits

Actual native scheduler enable/change/disable and sleep/resume behavior remain unverified
on Linux user-systemd sessions, macOS and Windows. No persistent job was activated here.
This is a release gate, not established cross-platform lifecycle support.

Uncertain locks, abandoned reclamation guards, non-Linux locks and records without matching
boot/namespace identity require inspected manual recovery. Automatic recovery deliberately
never guesses that a live or uncertain owner is dead. Directory journals cover tested process
interruption boundaries, not guaranteed power-loss durability or multi-filesystem atomicity.

Legacy migration preserves differences rather than guessing whether they are personal edits
or older upstream content. Such differences require manual reconciliation before unattended
updates. Canonical versions remain shared across install scopes. Native schedules also depend
on a working per-user session and stable installed Node/CLI paths; see
[automatic updates](auto-update.md) for operation and recovery details.

## Cross-platform CI follow-up

The initial draft PR run passed seven jobs and exposed two platform-specific regressions:
macOS project paths reached through filesystem aliases were skipped, and concurrent Windows
JSON replacement could fail with EPERM. Project matching now compares filesystem identities
without changing recorded paths or relaxing shared-scope checks. Windows replacement retries
transient sharing errors with bounded backoff while retaining the old destination. Eleven
additional regression cases cover both fixes. The follow-up local full suite passed 224 tests
and the offline suite passed 143 tests; build, strict lint and formatting passed. Native
scheduler lifecycle verification remains a separate release gate regardless of CI results.
