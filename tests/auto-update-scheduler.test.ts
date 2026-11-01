import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SchedulerAbsentError,
  installScheduler,
  makeSchedulerPlan,
  removeScheduler,
  verifyScheduler,
} from "../src/lib/scheduler.js";
import { parseInterval } from "../src/lib/auto-update.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  roots.length = 0;
});
const opts = {
  intervalHours: 24,
  node: "/usr/bin/node",
  cli: "/opt/skill box/dist/cli.js",
  home: "/tmp/fake-home",
};
describe("native scheduler plans", () => {
  it("uses fixed executables, quoted paths and persistent hourly Linux wakeups", () => {
    const plan = makeSchedulerPlan({ ...opts, platform: "linux" });
    expect(plan.files[0].content).toContain(
      '"/opt/skill box/dist/cli.js" auto-update run --scheduled --json'
    );
    expect(plan.files[1].content).toContain("OnCalendar=hourly\nPersistent=true");
    expect(plan.enable).toContainEqual([
      "systemctl",
      "--user",
      "enable",
      "--now",
      "skillbox-auto-update.timer",
    ]);
  });
  it("escapes systemd percent and dollar expansions", () => {
    const plan = makeSchedulerPlan({ ...opts, cli: "/opt/%h/$TOKEN.js", platform: "linux" });
    expect(plan.files[0].content).toContain("/opt/%%h/$$TOKEN.js");
  });
  it("produces launchd argv and escapes XML", () => {
    const plan = makeSchedulerPlan({ ...opts, platform: "darwin", uid: 501, cli: "/tmp/A&B.js" });
    expect(plan.files[0].content).toContain("/tmp/A&amp;B.js");
    expect(plan.files[0].content).toContain("<integer>86400</integer>");
    expect(plan.disable).toEqual([["launchctl", "bootout", "gui/501/com.skillbox.auto-update"]]);
  });
  it("uses Windows XML and least privilege without shell invocation", () => {
    const plan = makeSchedulerPlan({
      ...opts,
      platform: "win32",
      cli: "C:\\Program Files\\Skillbox\\cli.js",
    });
    expect(plan.files[0].content).toContain("&quot;C:\\Program Files\\Skillbox\\cli.js&quot;");
    expect(plan.files[0].content).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(plan.enable[0][0]).toBe("schtasks");
  });
  it("rejects unsupported platforms, unsafe paths and invalid intervals", () => {
    expect(() => makeSchedulerPlan({ ...opts, platform: "freebsd" })).toThrow("not supported");
    expect(() =>
      makeSchedulerPlan({ ...opts, cli: "/tmp/x\nInjected", platform: "linux" })
    ).toThrow("control");
    for (const value of [0, 1.5, 8761, NaN])
      expect(() => makeSchedulerPlan({ ...opts, intervalHours: value })).toThrow("Interval");
    expect(parseInterval("2d")).toBe(48);
    for (const value of ["0h", "30m", "1.5h", "366d", "junk"])
      expect(() => parseInterval(value)).toThrow("Interval");
  });
  it("writes scheduler files and verifies activation using an injected executor", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-scheduler-"));
    roots.push(home);
    const plan = makeSchedulerPlan({ ...opts, home, platform: "linux" });
    const run = vi.fn().mockResolvedValue(undefined);
    await installScheduler(plan, run);
    expect(await fs.readFile(plan.files[0].path, "utf8")).toContain("ExecStart=");
    expect(run).toHaveBeenCalledTimes(3);
    expect(await verifyScheduler(plan, run)).toBe(true);
    const stop = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SchedulerAbsentError("disabled"))
      .mockRejectedValueOnce(new SchedulerAbsentError("inactive"))
      .mockResolvedValueOnce(undefined);
    await removeScheduler(plan, stop);
    expect(stop).toHaveBeenLastCalledWith("systemctl", ["--user", "daemon-reload"]);
    await expect(fs.access(plan.files[0].path)).rejects.toThrow();
  });
  it("does not claim success if registration fails", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "skillbox-scheduler-"));
    roots.push(home);
    const plan = makeSchedulerPlan({ ...opts, home, platform: "win32" });
    await expect(
      installScheduler(plan, async () => {
        throw new Error("denied");
      })
    ).rejects.toThrow("denied");
    expect((await fs.readFile(plan.files[0].path)).subarray(0, 2)).toEqual(Buffer.from([255, 254]));
  });
  it("does not suppress a failed disable merely because the timer is inactive", async () => {
    const plan = makeSchedulerPlan({ ...opts, platform: "linux" });
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockRejectedValueOnce(new SchedulerAbsentError("inactive"));
    await expect(removeScheduler(plan, run)).rejects.toThrow("permission denied");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("rejects enabled-but-inactive timers during removal verification", async () => {
    const plan = makeSchedulerPlan({ ...opts, platform: "linux" });
    const run = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SchedulerAbsentError("inactive"));
    await expect(removeScheduler(plan, run)).rejects.toThrow("still enabled");
    expect(run).toHaveBeenNthCalledWith(2, "systemctl", [
      "--user",
      "is-enabled",
      "skillbox-auto-update.timer",
    ]);
  });
  it("does not equate an unavailable status probe with successful cleanup", async () => {
    const plan = makeSchedulerPlan({ ...opts, platform: "linux" });
    const run = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("bus unavailable"));
    await expect(removeScheduler(plan, run)).rejects.toThrow("bus unavailable");
  });
});
