import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build (`npm run build` first) on port 3100, a dedicated
// database (E2E_DATABASE_URL) and a local OpenAI-compatible AI stub started in global setup.
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://amanta:amanta_dev@localhost:5432/amanta_e2e";
export const E2E_PORT = 3100;
export const AI_STUB_PORT = 4010;

const serverEnv = {
  DATABASE_URL: E2E_DB,
  APP_URL: `http://localhost:${E2E_PORT}`,
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: "./storage-e2e",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "e2e-test-key",
  OPENAI_BASE_URL: `http://127.0.0.1:${AI_STUB_PORT}/v1`,
  OPENAI_MODEL: "stub-model",
  COOKIE_SECURE: "false",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "id-ID", timezoneId: "Asia/Jakarta" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: `npx next start -p ${E2E_PORT}`, url: `http://localhost:${E2E_PORT}/api/health`, reuseExistingServer: false, timeout: 120_000, env: serverEnv },
    { command: "node tests/e2e/run-worker-and-stub.mjs", url: `http://127.0.0.1:${AI_STUB_PORT}/health`, reuseExistingServer: false, timeout: 60_000, env: { ...serverEnv, AI_STUB_PORT: String(AI_STUB_PORT) } },
  ],
});
