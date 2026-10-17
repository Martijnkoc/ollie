import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { privateJson } from "@/lib/http";
import { siteStatus } from "@/lib/data";

/** Health check for uptime monitoring. Reveals no configuration values. */
export async function GET() {
  const cfg = config();
  let database: "ok" | "error" | "not_used" = "not_used";
  let status = await siteStatus(null, cfg);
  if (cfg.provider) {
    try {
      const db = await getDb();
      status = await siteStatus(db, cfg);
      database = "ok";
    } catch {
      database = "error";
    }
  }
  const healthy = cfg.dataMode !== "unconfigured" && database === "ok" && !status.degraded;
  return privateJson({ healthy, mode: cfg.dataMode, database, lastSync: status.lastSync, lastLiveSync: status.lastLiveSync, failingJobs: status.failingJobs }, healthy ? 200 : 503);
}
