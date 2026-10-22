import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://sy:sy@localhost:5432/sy_e2e";
export const E2E_WEBHOOK_SECRET = "whsec_e2e_contract";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node e2e/reset-db.mjs && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      SESSION_SECRET: "e2e-session-secret",
      STRIPE_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
      // Test transports: mail goes to a table, files to local disk. Never set these in production.
      ALLOW_TEST_TRANSPORTS: "true",
      MAIL_TRANSPORT: "outbox",
      STORAGE_PROVIDER: "local",
      UPLOAD_DIR: ".data/e2e-uploads",
      CRON_SECRET: "e2e-cron",
      CONTACT_EMAIL: "hallo@example.nl",
    },
  },
});
