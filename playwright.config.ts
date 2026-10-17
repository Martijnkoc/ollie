import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789abcdef";
export const E2E_ADMIN = { username: "beheer", password: "e2e-wachtwoord-0123456789" };

/**
 * End-to-end tests run the production build against the labelled demo provider and a fresh
 * embedded database, so they need no network and no secrets.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node e2e/prepare.mjs && npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/over`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      DATA_PROVIDER: "demo",
      ALLOW_DEMO_DATA: "true",
      PGLITE_DIR: ".e2e/pglite",
      SITE_URL: BASE_URL,
      CRON_SECRET: E2E_CRON_SECRET,
      ADMIN_USER: E2E_ADMIN.username,
      ADMIN_PASSWORD: E2E_ADMIN.password,
      SPORTMONKS_API_TOKEN: "",
      ANTHROPIC_API_KEY: "",
    },
  },
});
