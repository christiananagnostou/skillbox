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
