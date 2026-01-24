import { beforeAll, afterAll, beforeEach } from "vitest";
import { TestEnvironment } from "./helpers/environment.js";

export const testEnv = new TestEnvironment();

beforeAll(async () => {
  await testEnv.setup();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.reset();
});
