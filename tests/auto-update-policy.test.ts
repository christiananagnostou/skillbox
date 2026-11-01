import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ root: "" }));
vi.mock("../src/lib/paths.js", () => ({ skillboxRoot: () => state.root }));
vi.mock("../src/lib/update-engine.js", () => ({ runUpdates: vi.fn() }));
vi.mock("../src/lib/scheduler.js", () => ({
  makeSchedulerPlan: vi.fn(() => ({})),
  installScheduler: vi.fn(),
  removeScheduler: vi.fn(),
  verifyScheduler: vi.fn(),
}));
import { runUpdates } from "../src/lib/update-engine.js";
import { installScheduler, removeScheduler, verifyScheduler } from "../src/lib/scheduler.js";
import {
  autoUpdateStatus,
  disableAutoUpdate,
  enableAutoUpdate,
  loadAutoUpdateHistory,
  loadAutoUpdatePolicy,
  runAutoUpdate,
} from "../src/lib/auto-update.js";
beforeEach(async () => {
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-policy-"));
  vi.mocked(runUpdates)
    .mockReset()
    .mockResolvedValue({ results: [], total: 0, updated: 0, skipped: 0, failed: 0 });
  vi.mocked(installScheduler).mockReset().mockResolvedValue();
  vi.mocked(removeScheduler).mockReset().mockResolvedValue();
  vi.mocked(verifyScheduler).mockReset().mockResolvedValue(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(state.root, { recursive: true, force: true });
});
async function policy(values: Record<string, unknown> = {}): Promise<void> {
  await fs.writeFile(
    path.join(state.root, "auto-update.json"),
    JSON.stringify({
      version: 1,
      enabled: true,
      intervalHours: 24,
      exclude: [],
      pinned: [],
      ...values,
    })
  );
}
describe("automatic update policy", () => {
  it("is opt-in and scheduled invocation stays inert by default", async () => {
    expect((await loadAutoUpdatePolicy()).enabled).toBe(false);
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ skipped: true });
    expect(runUpdates).not.toHaveBeenCalled();
    expect(await loadAutoUpdateHistory()).toEqual([]);
  });
  it("applies exclusion/pin policy and prevents catch-up bursts", async () => {
    await policy({ exclude: ["ignored"], pinned: ["fixed"] });
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ ok: true });
    expect(runUpdates).toHaveBeenCalledWith({
      dryRun: undefined,
      exclude: ["ignored"],
      pinned: ["fixed"],
    });
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ skipped: true });
    expect(runUpdates).toHaveBeenCalledTimes(1);
  });
  it("dry-run does not write history or postpone the real run", async () => {
    await policy();
    await runAutoUpdate({ dryRun: true });
    expect(await loadAutoUpdateHistory()).toEqual([]);
    await runAutoUpdate({ scheduled: true });
    expect(runUpdates).toHaveBeenCalledTimes(2);
  });
  it("records sanitized failure and backs off until next interval", async () => {
    await policy();
    vi.mocked(runUpdates).mockRejectedValue(new Error("secret-token"));
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ ok: false, failed: 1 });
    expect(JSON.stringify(await loadAutoUpdateHistory())).not.toContain("secret-token");
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ skipped: true });
  });
  it("retains cleanup state on registration failure and allows disabling", async () => {
    vi.spyOn(fs, "access").mockResolvedValue();
    vi.mocked(installScheduler).mockRejectedValue(new Error("unavailable"));
    await expect(enableAutoUpdate({ interval: "2d" })).rejects.toThrow("unavailable");
    expect(await loadAutoUpdatePolicy()).toMatchObject({
      enabled: false,
      registered: true,
      intervalHours: 48,
    });
    expect(await autoUpdateStatus()).toMatchObject({ schedulerActive: true });
    await disableAutoUpdate();
    expect(removeScheduler).toHaveBeenCalledTimes(1);
    expect(await loadAutoUpdatePolicy()).toMatchObject({ enabled: false, registered: false });
  });
  it("changes intervals by removing the old native registration", async () => {
    vi.spyOn(fs, "access").mockResolvedValue();
    await policy({ registered: true });
    await enableAutoUpdate({ interval: "3h" });
    expect(removeScheduler).toHaveBeenCalledTimes(1);
    expect(installScheduler).toHaveBeenCalledTimes(1);
    expect(await loadAutoUpdatePolicy()).toMatchObject({ enabled: true, intervalHours: 3 });
  });
  it("keeps policy disabled if native cleanup fails", async () => {
    await policy(); // Legacy enabled policy without a registered field.
    vi.mocked(removeScheduler).mockRejectedValue(new Error("denied"));
    await expect(disableAutoUpdate()).rejects.toThrow("denied");
    expect(await loadAutoUpdatePolicy()).toMatchObject({ enabled: false, registered: true });
    expect(await runAutoUpdate({ scheduled: true })).toMatchObject({ skipped: true });
  });
});
