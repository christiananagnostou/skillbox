import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const label = "com.skillbox.auto-update";
export type SchedulerBackend = "systemd" | "launchd" | "task-scheduler";
export type SchedulerPlan = {
  backend: SchedulerBackend;
  files: { path: string; content: string }[];
  enable: string[][];
  disable: string[][];
  verify: string[][];
  verifyRemoved?: string[][];
  afterRemove?: string[][];
};

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function systemdQuote(value: string, expandDollar = true): string {
  return (
    '"' +
    value
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("%", "%%")
      .replaceAll("$", () => (expandDollar ? "$$" : "$")) +
    '"'
  );
}
function windowsQuote(value: string): string {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1") + '"';
}
export function makeSchedulerPlan(options: {
  intervalHours: number;
  node: string;
  cli: string;
  platform?: NodeJS.Platform;
  home?: string;
  uid?: number;
}): SchedulerPlan {
  const { intervalHours, node, cli } = options;
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8760) {
    throw new Error("Interval must be a whole number of hours between 1 and 8760.");
  }
  const platform = options.platform ?? process.platform;
  const home = options.home ?? os.homedir();
  if (
    [node, cli, home].some(
      (value) => value.includes("\r") || value.includes("\n") || value.includes("\0")
    )
  )
    throw new Error("Scheduler paths contain unsupported control characters.");
  if (platform === "linux") {
    const base = path.join(home, ".config", "systemd", "user");
    return {
      backend: "systemd",
      files: [
        {
          path: path.join(base, "skillbox-auto-update.service"),
          content: `[Unit]\nDescription=Update installed Skillbox skills\n[Service]\nType=oneshot\nExecStart=${systemdQuote(node)} ${systemdQuote(cli)} auto-update run --scheduled --json\nEnvironment=${systemdQuote(`HOME=${home}`, false)}\nTimeoutStartSec=15min\n`,
        },
        {
          path: path.join(base, "skillbox-auto-update.timer"),
          content: `[Unit]\nDescription=Periodic Skillbox updates\n[Timer]\nOnCalendar=hourly\nPersistent=true\nUnit=skillbox-auto-update.service\n[Install]\nWantedBy=timers.target\n`,
        },
      ],
      enable: [
        ["systemctl", "--user", "daemon-reload"],
        ["systemctl", "--user", "enable", "--now", "skillbox-auto-update.timer"],
      ],
      disable: [["systemctl", "--user", "disable", "--now", "skillbox-auto-update.timer"]],
      verify: [["systemctl", "--user", "is-active", "--quiet", "skillbox-auto-update.timer"]],
      verifyRemoved: [
        ["systemctl", "--user", "is-enabled", "skillbox-auto-update.timer"],
        ["systemctl", "--user", "is-active", "--quiet", "skillbox-auto-update.timer"],
      ],
      afterRemove: [["systemctl", "--user", "daemon-reload"]],
    };
  }
  if (platform === "darwin") {
    const target = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
    const domain = `gui/${options.uid ?? process.getuid?.() ?? 0}`;
    return {
      backend: "launchd",
      files: [
        {
          path: target,
          content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[node, cli, "auto-update", "run", "--scheduled", "--json"].map((arg) => `<string>${xml(arg)}</string>`).join("")}</array><key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(home)}</string></dict><key>StartInterval</key><integer>${intervalHours * 3600}</integer><key>RunAtLoad</key><true/></dict></plist>\n`,
        },
      ],
      enable: [["launchctl", "bootstrap", domain, target]],
      disable: [["launchctl", "bootout", `${domain}/${label}`]],
      verify: [["launchctl", "print", `${domain}/${label}`]],
    };
  }
  if (platform === "win32") {
    const target = path.join(home, ".config", "skillbox", "auto-update-task.xml");
    // XML avoids cmd.exe interpretation and preserves paths containing spaces.
    return {
      backend: "task-scheduler",
      files: [
        {
          path: target,
          content: `<?xml version="1.0" encoding="UTF-16"?>\n<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><TimeTrigger><Repetition><Interval>PT1H</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2020-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers><Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT15M</ExecutionTimeLimit></Settings><Actions Context="Author"><Exec><Command>${xml(node)}</Command><Arguments>${xml(`${windowsQuote(cli)} auto-update run --scheduled --json`)}</Arguments></Exec></Actions></Task>\n`,
        },
      ],
      enable: [["schtasks", "/Create", "/TN", "SkillboxAutoUpdate", "/XML", target, "/F"]],
      disable: [["schtasks", "/Delete", "/TN", "SkillboxAutoUpdate", "/F"]],
      verify: [["schtasks", "/Query", "/TN", "SkillboxAutoUpdate"]],
    };
  }
  throw new Error(`Automatic updates are not supported on ${platform}.`);
}

export type SchedulerExecutor = (command: string, args: string[]) => Promise<void>;
export class SchedulerAbsentError extends Error {}
const execute: SchedulerExecutor = async (command, args) => {
  try {
    await exec(command, args, { timeout: 30_000, maxBuffer: 64 * 1024 });
  } catch (error) {
    const failure = error as { code?: string | number; stderr?: string; stdout?: string };
    const absent =
      (command === "systemctl" &&
        args.includes("is-active") &&
        [3, 4].includes(Number(failure.code))) ||
      (command === "systemctl" &&
        args.includes("is-enabled") &&
        (failure.code === 4 ||
          (failure.code === 1 && /^(disabled|not-found)$/.test((failure.stdout ?? "").trim())))) ||
      (command === "launchctl" && failure.code === 113) ||
      (command === "schtasks" &&
        failure.code === 1 &&
        /cannot find the file specified/i.test(failure.stderr ?? ""));
    if (absent) throw new SchedulerAbsentError("Scheduler registration is absent or inactive.");
    throw new Error(
      `Scheduler command failed: ${command}. Check that the per-user scheduler is available.`
    );
  }
};
export async function verifyScheduler(
  plan: SchedulerPlan,
  run: SchedulerExecutor = execute
): Promise<boolean> {
  try {
    for (const [command, ...args] of plan.verify) await run(command, args);
    return true;
  } catch (error) {
    if (error instanceof SchedulerAbsentError) return false;
    throw new Error(
      "Unable to determine native scheduler status. Check the per-user scheduler and retry."
    );
  }
}
export async function installScheduler(
  plan: SchedulerPlan,
  run: SchedulerExecutor = execute
): Promise<void> {
  for (const file of plan.files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(
      file.path,
      plan.backend === "task-scheduler" ? "\ufeff" + file.content : file.content,
      { encoding: plan.backend === "task-scheduler" ? "utf16le" : "utf8", mode: 0o600 }
    );
  }
  for (const [command, ...args] of plan.enable) await run(command, args);
  if (!(await verifyScheduler(plan, run)))
    throw new Error("Scheduler registration could not be verified.");
}
export async function removeScheduler(
  plan: SchedulerPlan,
  run: SchedulerExecutor = execute
): Promise<void> {
  for (const [command, ...args] of plan.disable) {
    try {
      await run(command, args);
    } catch (error) {
      if (!(error instanceof SchedulerAbsentError) || plan.backend === "systemd") throw error;
    }
  }
  for (const [command, ...args] of plan.verifyRemoved ?? plan.verify) {
    let removed = false;
    try {
      await run(command, args);
    } catch (error) {
      if (!(error instanceof SchedulerAbsentError)) throw error;
      removed = true;
    }
    if (!removed)
      throw new Error("Scheduler is still enabled, registered or active after disable.");
  }
  for (const file of plan.files) await fs.rm(file.path, { force: true });
  for (const [command, ...args] of plan.afterRemove ?? []) await run(command, args);
}
