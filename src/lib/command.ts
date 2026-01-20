import { isJsonEnabled, printError, printJson } from "./output.js";

export const getErrorMessage = (error: unknown, fallback = "Unexpected error"): string => {
  return error instanceof Error ? error.message : fallback;
};

export const handleCommandError = (
  options: { json?: boolean },
  command: string,
  error: unknown
): void => {
  const message = getErrorMessage(error);
  if (isJsonEnabled(options)) {
    printJson({ ok: false, command, error: { message } });
    return;
  }
  printError(message);
};
