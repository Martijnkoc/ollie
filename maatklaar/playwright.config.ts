import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against production builds with labelled test doubles for PDOK and Mollie
 * (e2e/mock-services.mjs). Port 3100: DEMO payments. Port 3101: the real Mollie adapter against the double.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    acceptDownloads: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://localhost:3101/privacy",
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
