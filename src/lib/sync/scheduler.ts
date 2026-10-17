import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import type { AppConfig } from "@/lib/env";
import { createProvider } from "@/lib/providers";
import { ProviderError, type RequestRecord } from "@/lib/providers/http";
import type { FootballProvider, ProviderContext } from "@/lib/providers/types";
import {
  activeCompetitions,
  maintenance,
  syncCompetitions,
  syncDetailsBackfill,
  syncLive,
  syncNearFixtures,
  syncSeasonFixtures,
  syncStandings,
  syncTeams,
  type JobContext,
  type JobResult,
} from "./jobs";
import { acquireLease, finishRun, isDue, lastSuccess, recordFailure, recordSuccess, recordUsage, releaseLease, requestsToday, startRun, type Trigger } from "./state";
import { syncAnalyses } from "@/lib/ai/job";

interface JobDef {
  key: string;
  /** Essential jobs may use the whole daily budget; the rest stops at 80 %. */
  essential: boolean;
  leaseSeconds: number;
  run: (ctx: JobContext) => Promise<JobResult>;
}

export interface JobOutcome {
  key: string;
  status: "success" | "failed" | "skipped";
  message: string;
  requests: number;
}

export interface TickReport {
  provider: string | null;
  status: "ok" | "unconfigured" | "partial";
  jobs: JobOutcome[];
}

export interface TickOptions {
  db: Db;
  cfg: AppConfig;
  trigger: Trigger;
  now?: () => Date;
  /** Only consider these job keys (prefix match, e.g. "fixtures:season"). */
  only?: string[];
  /** Ignore due times (admin "run now"); leases and budgets still apply. */
  force?: boolean;
  /** Stop starting new jobs after this many milliseconds. */
  deadlineMs?: number;
  providerContext?: ProviderContext;
  /** Injected provider for tests. */
  provider?: FootballProvider;
}

async function jobList(db: Db, provider: string): Promise<JobDef[]> {
  const comps = await activeCompetitions(db, provider);
  const perCompetition = comps.flatMap((c): JobDef[] => [
    { key: `fixtures:season:${c.slug}`, essential: false, leaseSeconds: 180, run: (ctx) => syncSeasonFixtures(ctx, c.slug, "current") },
    { key: `fixtures:history:${c.slug}`, essential: false, leaseSeconds: 180, run: (ctx) => syncSeasonFixtures(ctx, c.slug, "previous") },
  ]);
  return [
    { key: "competitions", essential: true, leaseSeconds: 180, run: syncCompetitions },
    // Near fixtures first: it is due only every 30 minutes, and live needs its kick-off times.
    { key: "fixtures:near", essential: true, leaseSeconds: 120, run: syncNearFixtures },
    { key: "live", essential: true, leaseSeconds: 90, run: syncLive },
    { key: "standings", essential: false, leaseSeconds: 180, run: syncStandings },
    { key: "teams", essential: false, leaseSeconds: 180, run: syncTeams },
    ...perCompetition,
    { key: "details:backfill", essential: false, leaseSeconds: 180, run: syncDetailsBackfill },
    { key: "analyses", essential: false, leaseSeconds: 240, run: syncAnalyses },
    { key: "maintenance", essential: false, leaseSeconds: 120, run: maintenance },
  ];
}

/**
 * Runs every job that is due, in priority order, each under its own lease. Safe to call from
 * several places at once (cron, admin, traffic): a job that is running elsewhere is skipped, and
 * a job that is not due does not touch the provider.
 */
export async function runDueJobs(options: TickOptions): Promise<TickReport> {
  const { db, cfg, trigger, force = false, deadlineMs = 40_000 } = options;
  const now = options.now ?? (() => new Date());
  const started = Date.now();

  let current = { requests: 0, failures: 0, lastStatus: null as number | null, rateRemaining: null as number | null };
  const onRequest = (r: RequestRecord) => {
    current.requests++;
    if (!r.ok) current.failures++;
    current.lastStatus = r.status;
    if (r.rateRemaining !== null) current.rateRemaining = r.rateRemaining;
    options.providerContext?.onRequest?.(r);
  };
  const provider = options.provider ?? createProvider(cfg, { ...options.providerContext, onRequest, now });
  if (!provider) return { provider: null, status: "unconfigured", jobs: [] };

  const owner = randomUUID();
  const outcomes: JobOutcome[] = [];
  const hasCompetitions = (await lastSuccess(db, "competitions")) !== null;
  const jobs = (await jobList(db, provider.id)).filter((j) => !options.only || options.only.some((prefix) => j.key.startsWith(prefix)));

  for (const job of jobs) {
    if (Date.now() - started > deadlineMs) {
      outcomes.push({ key: job.key, status: "skipped", message: "Tijdslimiet van deze ronde bereikt", requests: 0 });
      continue;
    }
    // Everything else depends on knowing which competitions and seasons exist.
    if (job.key !== "competitions" && !hasCompetitions && !outcomes.some((o) => o.key === "competitions" && o.status === "success")) {
      outcomes.push({ key: job.key, status: "skipped", message: "Wacht op de eerste competitie-synchronisatie", requests: 0 });
      continue;
    }
    const at = now();
    if (!force && !(await isDue(db, job.key, at))) continue;
    if (cfg.providerDailyBudget !== null) {
      const used = await requestsToday(db, provider.id, at);
      const cap = job.essential ? cfg.providerDailyBudget : Math.floor(cfg.providerDailyBudget * 0.8);
      if (used >= cap) {
        outcomes.push({ key: job.key, status: "skipped", message: `Dagbudget bereikt (${used}/${cfg.providerDailyBudget})`, requests: 0 });
        continue;
      }
    }
    if (!(await acquireLease(db, job.key, owner, job.leaseSeconds, at))) {
      outcomes.push({ key: job.key, status: "skipped", message: "Draait al elders", requests: 0 });
      continue;
    }

    current = { requests: 0, failures: 0, lastStatus: null, rateRemaining: null };
    const runId = await startRun(db, provider.id, job.key, trigger, at);
    try {
      const result = await job.run({ db, cfg, provider, now });
      await recordSuccess(db, job.key, now(), result.nextDueInSeconds);
      await finishRun(db, runId, "success", now(), current.requests, result.items, result.message);
      outcomes.push({ key: job.key, status: "success", message: result.message, requests: current.requests });
    } catch (err) {
      const message = err instanceof ProviderError ? `${err.kind}: ${err.message}` : err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const wait = await recordFailure(db, job.key, now(), message, err instanceof ProviderError ? err.retryAfterSeconds : undefined);
      await finishRun(db, runId, "failed", now(), current.requests, 0, `${message} (opnieuw over ${Math.round(wait / 60)} min)`);
      outcomes.push({ key: job.key, status: "failed", message, requests: current.requests });
      console.error(`[sync] ${job.key} mislukt: ${message}`);
      // A rejected token fails every job the same way; stop instead of burning through the list.
      if (err instanceof ProviderError && (err.kind === "auth" || (err.kind === "rate_limited" && job.essential))) {
        await recordUsage(db, provider.id, now(), current.requests, current.failures, current.lastStatus, current.rateRemaining);
        await releaseLease(db, job.key, owner);
        break;
      }
    }
    await recordUsage(db, provider.id, now(), current.requests, current.failures, current.lastStatus, current.rateRemaining);
    await releaseLease(db, job.key, owner);
  }

  return { provider: provider.id, status: outcomes.some((o) => o.status === "failed") ? "partial" : "ok", jobs: outcomes };
}
