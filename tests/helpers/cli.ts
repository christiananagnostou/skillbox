import { execa, type ExecaError, type Result } from "execa";
import path from "node:path";

const CLI_PATH = path.resolve(import.meta.dirname, "../../dist/cli.js");

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

export interface CliOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * Execute the skillbox CLI with given arguments
 */
export async function runCli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const { cwd, env = {}, timeout = 30000 } = options;

  try {
    const result: Result = await execa("node", [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
      timeout,
      reject: false,
    });

    return parseResult(result);
  } catch (error) {
    const execaError = error as ExecaError;
    return {
      exitCode: execaError.exitCode ?? 1,
      stdout: execaError.stdout ?? "",
      stderr: execaError.stderr ?? String(error),
    };
  }
}

/**
 * Execute CLI and expect JSON output
 */
export async function runCliJson<T = unknown>(
  args: string[],
  options: CliOptions = {}
): Promise<{ result: CliResult; data: T | null }> {
  const result = await runCli([...args, "--json"], options);
  return {
    result,
    data: result.json as T | null,
  };
}

/**
 * Execute CLI and expect success (exit code 0)
 */
export async function runCliSuccess(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const result = await runCli(args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI failed with exit code ${result.exitCode}:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
  return result;
}

/**
 * Execute CLI and expect failure (non-zero exit code)
 */
export async function runCliFailure(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const result = await runCli(args, options);
  if (result.exitCode === 0) {
    throw new Error(`CLI succeeded but expected failure:\nstdout: ${result.stdout}`);
  }
  return result;
}

function parseResult(result: Result): CliResult {
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.exitCode ?? 0;

  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Not JSON output
  }

  return { exitCode, stdout, stderr, json };
}

/**
 * Assert CLI JSON response structure
 */
export function assertJsonResponse(
  result: CliResult,
  expected: { ok: boolean; command: string }
): asserts result is CliResult & { json: { ok: boolean; command: string; data: unknown } } {
  if (!result.json) {
    throw new Error(`Expected JSON response but got: ${result.stdout}`);
  }

  const json = result.json as Record<string, unknown>;
  if (json.ok !== expected.ok) {
    throw new Error(`Expected ok=${expected.ok} but got ok=${json.ok}`);
  }
  if (json.command !== expected.command) {
    throw new Error(`Expected command="${expected.command}" but got command="${json.command}"`);
  }
}
