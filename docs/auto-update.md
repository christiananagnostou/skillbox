# Automatic skill updates

Automatic updates are opt-in and disabled by default. This feature updates eligible installed skills; it does not update Skillbox itself, discover new skills, or execute downloaded scripts.

```sh
skillbox auto-update dry-run --json
skillbox auto-update enable --interval 24h
skillbox auto-update status --json
skillbox auto-update run --json
skillbox auto-update logs --json
skillbox auto-update disable
```

Intervals use whole hours or days (`1h` through `365d`); the default is `24h`. Re-run `enable --interval 7d` to change the interval. `--exclude NAME` and `--pin NAME` are repeatable enable options. Supplied lists replace the existing corresponding list; omitted lists preserve it. To clear a list, disable scheduling, edit the respective array in `~/.config/skillbox/auto-update.json`, then enable again. Pins apply to this automatic-update policy; manual `skillbox update` is independent.

`run` deliberately executes once even when scheduling is disabled. `run --scheduled` is the native scheduler entrypoint: it checks both enabled state and elapsed time. `run --dry-run` (also `dry-run`) previews eligibility without fetching updates or writing run history. Local, disabled, excluded, pinned and locally modified skills are skipped by the shared update engine. See individual result reasons for eligibility and migration requirements.

Legacy skills without a complete baseline can use `skillbox migrate-baseline --dry-run --json` and then `skillbox migrate-baseline --json`. Migration compares against upstream, preserves local differences, and leaves modified locations protected. See [baseline migration](baseline-migration.md).

## Native scheduling

- Linux: per-user systemd service and timer under `~/.config/systemd/user`. An hourly calendar wakeup with `Persistent=true` calls the runner; the policy enforces the configured minimum interval. A missed wakeup can produce one catch-up on resume/login, never a burst of historical runs. Execution can be up to an hour after the interval becomes due. A working user systemd session is required; enabling linger is not performed.
- macOS: a LaunchAgent under `~/Library/LaunchAgents`, using `StartInterval` and `RunAtLoad`. The user must be logged in. Sleep/login behavior depends on launchd; the runner's due check prevents duplicate catch-up runs.
- Windows: a per-user Task Scheduler task, using an hourly wakeup, interactive-token/least-privilege execution and `StartWhenAvailable`. The runner enforces the configured interval, with up to an hour of scheduling delay. The user must be logged in. Task XML is UTF-16 with a BOM. Native registration requires `schtasks`.

Unsupported platforms fail explicitly. The generated registration invokes the current absolute Node executable and installed CLI path, without `npx` or shell downloads. After moving/reinstalling Skillbox or Node, run `enable` again. Scheduler environments may not include interactive-shell credentials; configure authentication through the existing supported mechanism and validate with `run`.

Enable verifies native registration before marking the policy enabled. An enable failure leaves the policy disabled and retains cleanup state; `disable` can retry native cleanup. Disable writes the disabled policy first, so a leftover native wakeup remains inert if removal fails. Linux removal verifies both disabled and inactive state, removes the unit files, then reloads systemd. An arbitrary disable error is never treated as successful cleanup. Status distinguishes failed/unknown native queries by returning an error, rather than reporting them as inactive. Some localized Windows task-query errors may need manual inspection because absence cannot be identified reliably from an unknown response.

## State, failures and recovery

Policy is stored in `auto-update.json`; the last 50 actual runs are in `auto-update-history.json`, beneath the Skillbox config root. History records counts and sanitized failure reasons, not network URLs, raw subprocess errors or credentials. A failed run waits until the next interval; there is no tight retry loop. Dry runs do not postpone the next real run.

All cooperating CLI mutations share a root lock. A second operation fails rather than racing an update. On Linux, a lock can be reclaimed only when its owner is proven dead in the same boot, host and PID namespace. Live, ambiguous, cross-boot, legacy or malformed locks remain protected. A process crash or forced scheduler timeout can therefore leave `mutation.lock` (or a `.reclaim` guard) requiring inspection; verify running processes and the on-disk state before removing it manually. Linux and Windows scheduler execution limits are 15 minutes. Native macOS and Windows process-death recovery is not automated.

Updates and copied target publication are not a multi-filesystem transaction. An interrupted run may need inspection/retry, and target-copy failures are reported separately from successful canonical publication. Scheduling does not make these boundaries atomic.

## Verification scope

Automated tests exercise policy defaults, interval gating, failure backoff, dry runs, native plan quoting, registration/cleanup errors, and interval changes with injected executors. No persistent scheduler was activated during development. Actual enable/change/disable and sleep/resume behavior require native Linux desktop/user-systemd, macOS, and Windows verification before release. This Linux cloud container alone does not establish cross-platform lifecycle support.
