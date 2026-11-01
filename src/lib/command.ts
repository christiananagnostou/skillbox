import { isJsonEnabled, printError, printJson } from "./output.js";

export function getErrorMessage(error: unknown, fallback = "Unexpected error"): string {
  return error instanceof Error ? error.message : fallback;
}

export function handleCommandError(
  options: { json?: boolean },
  command: string,
  error: unknown
): void {
  process.exitCode = 1;
  const message = getErrorMessage(error);
  if (isJsonEnabled(options)) {
    printJson({ ok: false, command, error: { message } });
    return;
  }
  printError(message);
}
