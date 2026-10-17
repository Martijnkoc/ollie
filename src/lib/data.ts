import "server-only";
import { connection } from "next/server";
import { getDb, type Db } from "./db";
import { config, type AppConfig } from "./env";
import type { ReadContext } from "./football/queries";
import { PROVIDER_LABEL } from "./providers/labels";

/**
 * Request-time read context for pages and API routes. Returns null when no data source is
 * configured, so pages can render an honest "not configured" state without touching a database.
 */
export async function readContext(): Promise<ReadContext | null> {
  await connection();
  const cfg = config();
  if (!cfg.provider) return null;
  return { db: await getDb(), cfg, provider: cfg.provider, now: new Date() };
}

export interface SiteStatus {
  mode: AppConfig["dataMode"];
  providerLabel: string | null;
  /** Last successful refresh of match data (live or schedule), ISO. */
  lastSync: string | null;
  lastLiveSync: string | null;
  failingJobs: number;
  /** True when match data has not been refreshed for too long while it should have been. */
  degraded: boolean;
}

export async function siteStatus(db: Db | null, cfg: AppConfig, now = new Date()): Promise<SiteStatus> {
  const base: SiteStatus = {
    mode: cfg.dataMode,
    providerLabel: cfg.provider ? PROVIDER_LABEL[cfg.provider] : null,
    lastSync: null,
    lastLiveSync: null,
    failingJobs: 0,
    degraded: false,
  };
  if (!db) return base;
  const rows = await db.query<{ key: string; last_success_at: Date | null; consecutive_failures: number }>(
    `select key, last_success_at, consecutive_failures from sync_state`,
  );
  const ts = (key: string) => {
    const r = rows.find((x) => x.key === key);
    return r?.last_success_at ? new Date(r.last_success_at) : null;
  };
  const live = ts("live");
  const near = ts("fixtures:near");
  const last = [live, near].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    ...base,
    lastSync: last?.toISOString() ?? null,
    lastLiveSync: live?.toISOString() ?? null,
    failingJobs: rows.filter((r) => r.consecutive_failures > 0).length,
    degraded: !last || now.getTime() - last.getTime() > 2 * 3600_000,
  };
}
