import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://ollie:ollie@localhost:5432/cafe_e2e";
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
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
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
      // Test transports: mail goes to a table, video is the labelled fake provider. Never set these in production.
      ALLOW_TEST_TRANSPORTS: "true",
      MAIL_TRANSPORT: "outbox",
      VIDEO_PROVIDER: "fake",
      CRON_SECRET: "e2e-cron",
    },
  },
});
