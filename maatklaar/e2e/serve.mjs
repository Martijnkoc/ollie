// Starts everything the end-to-end tests need: test doubles for PDOK and Mollie, one production build and two
// app servers (DEMO payments on 3100, the real Mollie adapter against the Mollie test double on 3101).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = (cmd, args, env = {}) => spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });

run("node", ["e2e/mock-services.mjs"], { MOCK_PORT: "3201" });

if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const data = mkdtempSync(path.join(tmpdir(), "maatklaar-e2e-"));
const common = {
  PDOK_LOCATIESERVER_URL: "http://localhost:3201/ls",
  PDOK_BAG_URL: "http://localhost:3201/bag",
  PDOK_TIMEOUT_MS: "1500",
};
run("npx", ["next", "start", "-p", "3100"], {
  ...common,
  APP_URL: "http://localhost:3100",
  ALLOW_DEMO_PAYMENTS: "true",
  ORDERS_FILE: path.join(data, "demo.json"),
  ALLOW_FILE_TRANSFER_STORE: "true",
  TRANSFERS_FILE: path.join(data, "transfers.json"),
});
run("npx", ["next", "start", "-p", "3101"], {
  ...common,
  APP_URL: "http://localhost:3101",
  MOLLIE_API_KEY: "test_e2emollieabcdefghijklmnop",
  MOLLIE_API_URL: "http://localhost:3201/mollie/v2",
  ALLOW_FILE_ORDER_STORE: "true",
  ORDERS_FILE: path.join(data, "mollie.json"),
});
