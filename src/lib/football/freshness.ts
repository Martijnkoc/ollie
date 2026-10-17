import type { Freshness } from "./model";
import { statusCategory, type MatchStatus } from "./status";

/**
 * Whether what we show can still be trusted as current.
 *  - live: stale when the last confirmation is older than three poll intervals (min. 3 minutes);
 *  - not started: stale when kick-off passed 10 minutes ago without a status change (we probably
 *    missed the start), or when the record was not confirmed for over a day;
 *  - finished / off: final.
 */
export function freshnessOf(status: MatchStatus, kickoffAt: Date, syncedAt: Date, now: Date, livePollSeconds: number): Freshness {
  const ageSeconds = (now.getTime() - syncedAt.getTime()) / 1000;
  const category = statusCategory(status);
  if (category === "live") return ageSeconds > Math.max(3 * livePollSeconds, 180) ? "stale" : "fresh";
  if (category === "finished" || category === "off") return "final";
  if (status === "scheduled" && now.getTime() - kickoffAt.getTime() > 10 * 60_000) return "stale";
  return ageSeconds > 26 * 3600 ? "stale" : "fresh";
}
