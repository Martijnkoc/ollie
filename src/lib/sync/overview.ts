import "server-only";
import type { Db } from "@/lib/db";
import { localDay } from "@/lib/time";

export interface JobState {
  key: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  failures: number;
  nextDueAt: string | null;
  running: boolean;
}

export interface RunRow {
  id: number;
  job: string;
  trigger: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  requests: number;
  items: number;
  message: string | null;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export async function syncOverview(db: Db, provider: string, now = new Date()) {
  const states = await db.query<{ key: string; last_success_at: Date | null; last_attempt_at: Date | null; last_error: string | null; consecutive_failures: number; next_due_at: Date | null; lock_until: Date | null }>(
    `select key, last_success_at, last_attempt_at, last_error, consecutive_failures, next_due_at, lock_until from sync_state order by key`,
  );
  const runs = await db.query<{ id: number; job: string; trigger: string; status: string; started_at: Date; finished_at: Date | null; requests: number; items: number; message: string | null }>(
    `select id, job, trigger, status, started_at, finished_at, requests, items, message from sync_runs where provider = $1 order by started_at desc limit 40`,
    [provider],
  );
  const [usage] = await db.query<{ requests: number; failures: number; last_status: number | null; rate_remaining: number | null }>(
    `select requests, failures, last_status, rate_remaining from provider_usage where provider = $1 and day = $2`,
    [provider, localDay(now)],
  );
  const [ai] = await db.query<{ ok: number; rejected: number; failed: number }>(
    `select count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status = 'rejected')::int as rejected, count(*) filter (where status = 'failed')::int as failed
     from ai_analyses where created_at > $1`,
    [new Date(now.getTime() - 7 * 86_400_000)],
  );
  return {
    jobs: states.map(
      (s): JobState => ({
        key: s.key,
        lastSuccessAt: iso(s.last_success_at),
        lastAttemptAt: iso(s.last_attempt_at),
        lastError: s.last_error,
        failures: s.consecutive_failures,
        nextDueAt: iso(s.next_due_at),
        running: s.lock_until !== null && new Date(s.lock_until) > now,
      }),
    ),
    runs: runs.map(
      (r): RunRow => ({
        id: Number(r.id),
        job: r.job,
        trigger: r.trigger,
        status: r.status,
        startedAt: new Date(r.started_at).toISOString(),
        durationMs: r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : null,
        requests: r.requests,
        items: r.items,
        message: r.message,
      }),
    ),
    usageToday: usage ?? { requests: 0, failures: 0, last_status: null, rate_remaining: null },
    aiLastWeek: ai ?? { ok: 0, rejected: 0, failed: 0 },
  };
}
