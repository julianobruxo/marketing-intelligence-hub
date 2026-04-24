import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = process.env.E2E_PORT ?? "3000";
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;
process.env.E2E_BASE_URL = E2E_BASE_URL;

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: E2E_BASE_URL,
    // Suba o servidor manualmente com npm run dev antes de rodar os testes.
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "test-secret-for-e2e-testing-only-32ch",
      PORT: E2E_PORT,
      DRIVE_PROVIDER_MODE: "MOCK",
      CANVA_PROVIDER_MODE: "MOCK",
      NB_PROVIDER_MODE: "MOCK",
      OPENAI_API_KEY: "",
      DEV_AUTH_EMAIL: "juliano@zazmic.com",
    },
  },
});
