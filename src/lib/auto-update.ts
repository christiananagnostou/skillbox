import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { writeJsonAtomic } from "./atomic-json.js";
import { withMutationLock } from "./mutation-lock.js";
import { skillboxRoot } from "./paths.js";
import {
  installScheduler,
  makeSchedulerPlan,
  removeScheduler,
  verifyScheduler,
} from "./scheduler.js";
import { runUpdates } from "./update-engine.js";

const policySchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(8760),
  registered: z.boolean().optional(),
  exclude: z.array(z.string()),
  pinned: z.array(z.string()),
  node: z.string().optional(),
  cli: z.string().optional(),
});
export type AutoUpdatePolicy = z.infer<typeof policySchema>;
export type AutoUpdateRun = {
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  ok: boolean;
  updated: number;
  failed: number;
  skipped: number;
  results: { name: string; status: string; reason?: string }[];
};
const policyPath = (): string => path.join(skillboxRoot(), "auto-update.json");
const historyPath = (): string => path.join(skillboxRoot(), "auto-update-history.json");
export function parseInterval(value: string): number {
  const match = /^(\d+)(h|d)$/.exec(value);
  if (!match) throw new Error("Interval must use whole hours or days, for example 24h or 7d.");
  const hours = Number(match[1]) * (match[2] === "d" ? 24 : 1);
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 8760)
    throw new Error("Interval must be between 1h and 365d.");
  return hours;
}
export async function loadAutoUpdatePolicy(): Promise<AutoUpdatePolicy> {
  try {
    return policySchema.parse(JSON.parse(await fs.readFile(policyPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 1, enabled: false, intervalHours: 24, exclude: [], pinned: [] };
    throw new Error("Invalid auto-update policy. Repair auto-update.json before continuing.");
  }
}
export async function loadAutoUpdateHistory(): Promise<AutoUpdateRun[]> {
  try {
    const data: unknown = JSON.parse(await fs.readFile(historyPath(), "utf8"));
    return z
      .array(
        z.object({
          startedAt: z.iso.datetime(),
          completedAt: z.iso.datetime(),
          dryRun: z.boolean(),
          ok: z.boolean(),
          updated: z.number().int().nonnegative(),
          failed: z.number().int().nonnegative(),
          skipped: z.number().int().nonnegative(),
          results: z.array(
            z.object({ name: z.string(), status: z.string(), reason: z.string().optional() })
          ),
        })
      )
      .max(50)
      .parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Invalid auto-update history.");
  }
}
function planFor(policy: AutoUpdatePolicy): ReturnType<typeof makeSchedulerPlan> {
  return makeSchedulerPlan({
    intervalHours: policy.intervalHours,
    node: policy.node ?? process.execPath,
    cli: policy.cli ?? fileURLToPath(new URL("../cli.js", import.meta.url)),
  });
}
export async function enableAutoUpdate(options: {
  interval?: string;
  exclude?: string[];
  pin?: string[];
}): Promise<AutoUpdatePolicy> {
  return withMutationLock(async () => {
    const old = await loadAutoUpdatePolicy();
    const next: AutoUpdatePolicy = {
      ...old,
      enabled: false,
      intervalHours: options.interval ? parseInterval(options.interval) : old.intervalHours,
      exclude: options.exclude ?? old.exclude,
      pinned: options.pin ?? old.pinned,
      node: process.execPath,
      cli: fileURLToPath(new URL("../cli.js", import.meta.url)),
    };
    await fs.access(next.node!);
    await fs.access(next.cli!);
    // Disable policy before touching the native registration; a partial failure remains inert.
    await writeJsonAtomic(policyPath(), next);
    if (old.enabled || old.registered) await removeScheduler(planFor(old));
    next.registered = true;
    await writeJsonAtomic(policyPath(), next);
    await installScheduler(planFor(next));
    next.enabled = true;
    await writeJsonAtomic(policyPath(), next);
    return next;
  });
}
export async function disableAutoUpdate(): Promise<AutoUpdatePolicy> {
  return withMutationLock(async () => {
    const policy = await loadAutoUpdatePolicy();
    const wasEnabled = policy.enabled || policy.registered;
    policy.enabled = false;
    policy.registered = !!wasEnabled;
    await writeJsonAtomic(policyPath(), policy);
    if (wasEnabled) await removeScheduler(planFor(policy));
    policy.registered = false;
    await writeJsonAtomic(policyPath(), policy);
    return policy;
  });
}
export async function autoUpdateStatus(): Promise<{
  policy: AutoUpdatePolicy;
  schedulerActive: boolean;
  lastRun: AutoUpdateRun | null;
}> {
  const policy = await loadAutoUpdatePolicy();
  return {
    policy,
    schedulerActive:
      policy.enabled || policy.registered ? await verifyScheduler(planFor(policy)) : false,
    lastRun: (await loadAutoUpdateHistory()).at(-1) ?? null,
  };
}
export async function runAutoUpdate(
  options: { dryRun?: boolean; scheduled?: boolean } = {}
): Promise<AutoUpdateRun | { skipped: true; reason: string }> {
  return withMutationLock(async () => {
    const policy = await loadAutoUpdatePolicy();
    const history = await loadAutoUpdateHistory();
    if (options.scheduled) {
      if (!policy.enabled) return { skipped: true, reason: "Automatic updates are disabled." };
      const last = history.filter((run) => !run.dryRun).at(-1);
      if (last && Date.now() - Date.parse(last.startedAt) < policy.intervalHours * 3_600_000)
        return { skipped: true, reason: "Update interval has not elapsed." };
    }
    const startedAt = new Date().toISOString();
    let report: Awaited<ReturnType<typeof runUpdates>>;
    try {
      report = await runUpdates({
        dryRun: options.dryRun,
        exclude: policy.exclude,
        pinned: policy.pinned,
      });
    } catch {
      const failure: AutoUpdateRun = {
        startedAt,
        completedAt: new Date().toISOString(),
        dryRun: !!options.dryRun,
        ok: false,
        updated: 0,
        failed: 1,
        skipped: 0,
        results: [
          {
            name: "",
            status: "failed",
            reason:
              "Update runner failed; inspect configuration and run skillbox update --json for diagnostics.",
          },
        ],
      };
      if (!options.dryRun) await writeJsonAtomic(historyPath(), [...history, failure].slice(-50));
      return failure;
    }
    const run: AutoUpdateRun = {
      startedAt,
      completedAt: new Date().toISOString(),
      dryRun: !!options.dryRun,
      ok: report.failed === 0,
      updated: report.updated,
      failed: report.failed,
      skipped: report.skipped,
      results: report.results.map(({ name, status, reason }) => ({
        name,
        status,
        reason:
          reason ??
          (status === "failed"
            ? "Update failed; run skillbox update --json for diagnostics."
            : undefined),
      })),
    };
    // Never persist fetched URLs, subprocess stderr, tokens or raw network errors.
    if (!options.dryRun) await writeJsonAtomic(historyPath(), [...history, run].slice(-50));
    return run;
  });
}
