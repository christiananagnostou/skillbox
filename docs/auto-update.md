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

- Linux: a per-user systemd service and hourly calendar timer under `~/.config/systemd/user`. Calendar timers coalesce sleep-time misses into one activation on resume; `Persistent=true` also catches time missed while the timer was inactive. `WakeSystem=false` prevents waking the computer. A working user systemd session is required; enabling linger is not performed. [systemd timer documentation](https://freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- macOS: a LaunchAgent under `~/Library/LaunchAgents`, using hourly `StartCalendarInterval` (`Minute: 0`) plus `RunAtLoad`. Apple documents sleep-time catch-up for calendar jobs; `StartInterval` does not provide the same contract. The user must be logged in. This is documented behavior, still requiring installed-manpage and runtime verification on a supported Mac. [Apple scheduling guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)
- Windows: a per-user Task Scheduler task with hourly indefinite repetition, interactive-token/least-privilege execution, `StartWhenAvailable=true` and `WakeToRun=false`. Omitting repetition `Duration` makes it indefinite, satisfying the documented catch-up eligibility. Missed tasks are queued with a documented default delay of 10 minutes; this is not immediate lid-open execution. The user must be logged in. XML is UTF-16 with a BOM. [Catch-up behavior](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable), [indefinite repetition](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-duration-repetitiontype-element)

The native hourly trigger only starts a short-lived runner; the policy decides whether an update is due. Enabling automatic updates includes this catch-up behavior without a separate wake observer or option. A brief sleep that misses no scheduled trigger need not run anything, and opening the lid before the configured interval has elapsed does not force an update. Missed triggers do not create a backlog of repeated updates. The mutation lock prevents overlapping executions. The laptop is never deliberately awakened to update skills.

Unsupported platforms fail explicitly. The generated registration invokes the current absolute Node executable and installed CLI path, without `npx` or shell downloads. After moving/reinstalling Skillbox or Node, run `enable` again. Scheduler environments may not include interactive-shell credentials; configure authentication through the existing supported mechanism and validate with `run`.

Enable verifies native registration before marking the policy enabled. An enable failure leaves the policy disabled and retains cleanup state; `disable` can retry native cleanup. Disable writes the disabled policy first, so a leftover native wakeup remains inert if removal fails. Linux removal verifies both disabled and inactive state, removes the unit files, then reloads systemd. An arbitrary disable error is never treated as successful cleanup. Status distinguishes failed/unknown native queries by returning an error, rather than reporting them as inactive. Some localized Windows task-query errors may need manual inspection because absence cannot be identified reliably from an unknown response.

## State, failures and recovery

Policy is stored in `auto-update.json`; the last 50 actual runs are in `auto-update-history.json`, beneath the Skillbox config root. History records counts and sanitized failure reasons, not network URLs, raw subprocess errors or credentials. After a successful run, the configured interval applies. After a failed attempt, scheduled retries become eligible one hour after that attempt started and occur on a subsequent native trigger; there is no tight retry loop. `status` reports `lastRun` and `lastSuccess` separately (`lastSuccess` is the most recent success retained in the 50-run history). Dry runs do not postpone the next real run.

Network readiness is established by attempting the actual source requests, each bounded by a 30-second timeout, rather than probing an unrelated website. If networking has not resumed, the failure is recorded and the next eligible hourly trigger retries. There is no always-running network observer, immediate reconnect trigger, or automatic in-process retry. Use `auto-update run` for an explicit immediate attempt.

All cooperating CLI mutations share a root lock. A second operation fails rather than racing an update. On Linux, a lock can be reclaimed only when its owner is proven dead in the same boot, host and PID namespace. Live, ambiguous, cross-boot, legacy or malformed locks remain protected. A process crash or forced scheduler timeout can therefore leave `mutation.lock` (or a `.reclaim` guard) requiring inspection; verify running processes and the on-disk state before removing it manually. Linux and Windows scheduler execution limits are 15 minutes. Native macOS and Windows process-death recovery is not automated.

Updates and copied target publication are not a multi-filesystem transaction. An interrupted run may need inspection/retry, and target-copy failures are reported separately from successful canonical publication. Scheduling does not make these boundaries atomic.

## Verification scope

Automated tests exercise policy defaults, interval gating, failure backoff, dry runs, native plan quoting, registration/cleanup errors, and interval changes with injected executors. No persistent scheduler was activated during development. Actual enable/change/disable and sleep/resume behavior require native Linux desktop/user-systemd, macOS, and Windows verification before release. This Linux cloud container alone does not establish cross-platform lifecycle support.

Native capability check in the current Linux cloud executor: PID 1 is `tail`, `systemctl --user is-system-running` reports `offline`, and the user bus and systemd runtime directories are absent. `systemctl --user status` cannot connect. No temporary lifecycle job can be installed meaningfully in this environment, so none was created. Generated Linux units passed the installed systemd 257 `systemd-analyze verify --man=no` parser using temporary files that were removed afterward. This is syntax verification only, not native activation or sleep/resume validation. macOS and Windows are not available in this executor.
