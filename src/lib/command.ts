import { isJsonEnabled, printError, printJson } from "./output.js";

export const handleCommandError = (
  options: { json?: boolean },
  command: string,
  error: unknown
): void => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (isJsonEnabled(options)) {
    printJson({ ok: false, command, error: { message } });
    return;
  }
  printError(message);
};
