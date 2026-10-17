import "server-only";
import { after } from "next/server";
import type { ReadContext } from "./football/queries";
import { runDueJobs } from "./sync/scheduler";

/**
 * Optional (SYNC_ON_TRAFFIC=true): visitors keep live data fresh when no scheduler runs often
 * enough. Only the live and near-fixture jobs are eligible, and only when due and not already
 * running, so traffic can never cause more provider calls than the schedule allows.
 */
export function refreshAfterResponse(ctx: ReadContext) {
  if (!ctx.cfg.syncOnTraffic) return;
  after(async () => {
    try {
      await runDueJobs({ db: ctx.db, cfg: ctx.cfg, trigger: "traffic", only: ["fixtures:near", "live"], deadlineMs: 20_000 });
    } catch (err) {
      console.error("[traffic-sync]", err instanceof Error ? err.message : err);
    }
  });
}
