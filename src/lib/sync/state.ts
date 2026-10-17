import "server-only";
import type { Db } from "@/lib/db";
import { localDay } from "@/lib/time";

/**
 * Bookkeeping for synchronisation: leases (so two schedulers never process the same job at the
 * same time), due times with back-off, a run log and the provider request counter.
 */

export type Trigger = "cron" | "admin" | "traffic" | "cli" | "test";

/** Atomically takes the lease on `key` until `ttlSeconds` from now. False if someone else holds it. */
export async function acquireLease(db: Db, key: string, owner: string, ttlSeconds: number, now: Date): Promise<boolean> {
  await db.query(`insert into sync_state (key) values ($1) on conflict (key) do nothing`, [key]);
  const rows = await db.query<{ key: string }>(
    `update sync_state set lock_owner = $2, lock_until = $3
     where key = $1 and (lock_until is null or lock_until < $4 or lock_owner = $2)
     returning key`,
    [key, owner, new Date(now.getTime() + ttlSeconds * 1000), now],
  );
  return rows.length === 1;
}

export async function releaseLease(db: Db, key: string, owner: string) {
  await db.query(`update sync_state set lock_owner = null, lock_until = null where key = $1 and lock_owner = $2`, [key, owner]);
}

export async function isDue(db: Db, key: string, now: Date): Promise<boolean> {
  const [row] = await db.query<{ next_due_at: Date | null }>(`select next_due_at from sync_state where key = $1`, [key]);
  return !row || row.next_due_at === null || new Date(row.next_due_at) <= now;
}

export async function markDue(db: Db, key: string, now: Date) {
  await db.query(
    `insert into sync_state (key, next_due_at) values ($1, $2) on conflict (key) do update set next_due_at = least(coalesce(sync_state.next_due_at, $2), $2)`,
    [key, now],
  );
}

export async function lastSuccess(db: Db, key: string): Promise<Date | null> {
  const [row] = await db.query<{ last_success_at: Date | null }>(`select last_success_at from sync_state where key = $1`, [key]);
  return row?.last_success_at ? new Date(row.last_success_at) : null;
}

export async function recordSuccess(db: Db, key: string, now: Date, nextDueInSeconds: number) {
  await db.query(
    `update sync_state set last_attempt_at = $2, last_success_at = $2, last_error = null, consecutive_failures = 0, next_due_at = $3 where key = $1`,
    [key, now, new Date(now.getTime() + nextDueInSeconds * 1000)],
  );
}

/** Exponential back-off: 1, 2, 4 … minutes, capped at an hour, or the provider's own cool-down. */
export function backoffSeconds(failures: number, retryAfterSeconds?: number) {
  const exp = Math.min(3600, 60 * 2 ** Math.max(0, failures - 1));
  return retryAfterSeconds ? Math.max(exp, Math.min(retryAfterSeconds, 6 * 3600)) : exp;
}

export async function recordFailure(db: Db, key: string, now: Date, message: string, retryAfterSeconds?: number) {
  const [row] = await db.query<{ consecutive_failures: number }>(
    `update sync_state set last_attempt_at = $2, last_error = $3, consecutive_failures = consecutive_failures + 1 where key = $1 returning consecutive_failures`,
    [key, now, message.slice(0, 500)],
  );
  const wait = backoffSeconds(row?.consecutive_failures ?? 1, retryAfterSeconds);
  await db.query(`update sync_state set next_due_at = $2 where key = $1`, [key, new Date(now.getTime() + wait * 1000)]);
  return wait;
}

export async function startRun(db: Db, provider: string, job: string, trigger: Trigger, now: Date): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    `insert into sync_runs (provider, job, trigger, started_at, status) values ($1, $2, $3, $4, 'running') returning id`,
    [provider, job, trigger, now],
  );
  return Number(row.id);
}

export async function finishRun(
  db: Db,
  id: number,
  status: "success" | "failed" | "skipped",
  now: Date,
  requests: number,
  items: number,
  message?: string,
) {
  await db.query(`update sync_runs set status = $2, finished_at = $3, requests = $4, items = $5, message = $6 where id = $1`, [
    id,
    status,
    now,
    requests,
    items,
    message?.slice(0, 500) ?? null,
  ]);
}

export async function recordUsage(
  db: Db,
  provider: string,
  now: Date,
  requests: number,
  failures: number,
  lastStatus: number | null,
  rateRemaining: number | null,
) {
  if (requests === 0) return;
  await db.query(
    `insert into provider_usage (provider, day, requests, failures, last_status, rate_remaining, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider, day) do update set
       requests = provider_usage.requests + excluded.requests, failures = provider_usage.failures + excluded.failures,
       last_status = coalesce(excluded.last_status, provider_usage.last_status),
       rate_remaining = coalesce(excluded.rate_remaining, provider_usage.rate_remaining), updated_at = excluded.updated_at`,
    [provider, localDay(now), requests, failures, lastStatus, rateRemaining, now],
  );
}

export async function requestsToday(db: Db, provider: string, now: Date): Promise<number> {
  const [row] = await db.query<{ requests: number }>(`select requests from provider_usage where provider = $1 and day = $2`, [
    provider,
    localDay(now),
  ]);
  return row?.requests ?? 0;
}
