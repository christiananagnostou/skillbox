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

export const isJsonEnabled = (options: { json?: boolean }) => Boolean(options.json);

export const printJson = (result: JsonResult): void => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

export const printInfo = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

export const printError = (message: string): void => {
  process.stderr.write(`${chalk.red(message)}\n`);
};
