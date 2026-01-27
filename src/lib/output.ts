import chalk from "chalk";

export type JsonResult = {
  ok: boolean;
  command: string;
  data?: unknown;
  error?: {
    message: string;
    code?: string;
  };
};

export function isJsonEnabled(options: { json?: boolean }): boolean {
  return Boolean(options.json);
}

// Progress indicator support
const isTTY = process.stdout.isTTY ?? false;

// Braille spinner frames (single character, smooth animation)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

export function startSpinner(message: string): void {
  if (!isTTY) return;

  spinnerFrame = 0;
  const render = () => {
    const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    process.stdout.write(`\r\x1b[K  ${frame} ${message}`);
    spinnerFrame++;
  };

  render();
  spinnerInterval = setInterval(render, 80);
}

export function stopSpinner(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
  if (isTTY) {
    process.stdout.write(`\r\x1b[K`);
  }
}

export function printProgressResult(message: string): void {
  stopSpinner();
  process.stdout.write(`${message}\n`);
}

export function printJson(result: JsonResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function printInfo(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function printError(message: string): void {
  process.stderr.write(`${chalk.red(message)}\n`);
}

export function printList(label: string, items: string[], indent = "- "): void {
  printInfo(`${label}: ${items.length}`);
  for (const item of items) {
    printInfo(`${indent}${item}`);
  }
}

export function printGroupList(
  label: string,
  groups: Array<{ key: string; items: string[] }>,
  itemPrefix = "  - "
): void {
  printInfo(`${label}: ${groups.length}`);
  for (const group of groups) {
    printInfo(`- ${group.key}`);
    for (const item of group.items) {
      printInfo(`${itemPrefix}${item}`);
    }
  }
}
