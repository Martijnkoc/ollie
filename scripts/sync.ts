// Runs one synchronisation round from the command line, with the same scheduler, leases and
// budgets as the cron endpoint. Usage: npm run sync [-- --force] [-- --only=live,fixtures]
// Reads .env.local / .env like Next.js does.
import nextEnv from "@next/env";

// @next/env is CommonJS; its named export is only reachable through the default import.
nextEnv.loadEnvConfig(process.cwd());
const { getDb } = await import("@/lib/db");
const { config } = await import("@/lib/env");
const { runDueJobs } = await import("@/lib/sync/scheduler");

const args = process.argv.slice(2);
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const cfg = config();
if (cfg.dataMode === "unconfigured") {
  console.error("Geen databron geconfigureerd. Zet DATA_PROVIDER en SPORTMONKS_API_TOKEN (of DATA_PROVIDER=demo).");
  for (const issue of cfg.issues) console.error(`- ${issue}`);
  process.exit(1);
}
const report = await runDueJobs({ db: await getDb(), cfg, trigger: "cli", force: args.includes("--force"), only, deadlineMs: 5 * 60_000 });
for (const job of report.jobs)
  console.log(`${job.status.padEnd(8)} ${job.key.padEnd(32)} ${String(job.requests).padStart(3)} req  ${job.message}`);
process.exit(report.status === "partial" ? 2 : 0);
