import "server-only";
import type { Db } from "@/lib/db";
import type { AppConfig } from "@/lib/env";
import { selectedCatalog } from "@/lib/football/catalog";
import type { ProviderMatch } from "@/lib/football/model";
import {
  linkSeasonTeams,
  pruneSeasonMatches,
  saveCompetition,
  saveMatchDetails,
  saveMatches,
  saveSeasons,
  saveStandings,
  saveTeams,
  type MatchContext,
} from "@/lib/football/repository";
import { isFinished, isLive, MATCH_STATUSES } from "@/lib/football/status";
import type { FootballProvider } from "@/lib/providers/types";
import { addDays } from "@/lib/time";
import { markDue } from "./state";

export interface JobContext {
  db: Db;
  cfg: AppConfig;
  provider: FootballProvider;
  now: () => Date;
}

export interface JobResult {
  items: number;
  message: string;
  /** When this job should run again. */
  nextDueInSeconds: number;
}

const HOUR = 3600;
const LIVE = MATCH_STATUSES.filter(isLive);
const FINISHED = MATCH_STATUSES.filter(isFinished);
const NOT_STARTED = ["scheduled", "time_tba", "delayed", "awaiting_updates", "unknown"];

const utcDate = (d: Date) => d.toISOString().slice(0, 10);

interface ActiveCompetition {
  id: number;
  slug: string;
  external_id: string;
  current_season_id: number | null;
  season_external_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

export async function activeCompetitions(db: Db, provider: string): Promise<ActiveCompetition[]> {
  return db.query<ActiveCompetition>(
    `select c.id, c.slug, c.external_id, c.current_season_id, s.external_id as season_external_id,
            to_char(s.starts_on, 'YYYY-MM-DD') as starts_on, to_char(s.ends_on, 'YYYY-MM-DD') as ends_on
     from competitions c left join seasons s on s.id = c.current_season_id
     where c.provider = $1 and c.availability = 'available'
     order by c.sort_order`,
    [provider],
  );
}

async function matchContext(db: Db, provider: string, now: Date): Promise<MatchContext> {
  const comps = await db.query<{ id: number; external_id: string }>(
    `select id, external_id from competitions where provider = $1 and availability = 'available'`,
    [provider],
  );
  const seasons = await db.query<{ id: number; external_id: string }>(
    `select s.id, s.external_id from seasons s join competitions c on c.id = s.competition_id where s.provider = $1 and c.availability = 'available'`,
    [provider],
  );
  return {
    provider,
    competitionIds: new Map(comps.map((c) => [c.external_id, c.id])),
    seasonIds: new Map(seasons.map((s) => [s.external_id, s.id])),
    now,
  };
}

/** Availability of each catalogue competition at the source, plus its current and previous season. */
export async function syncCompetitions(ctx: JobContext): Promise<JobResult> {
  const { db, provider } = ctx;
  let available = 0;
  const notes: string[] = [];
  for (const entry of selectedCatalog(ctx.cfg.competitions)) {
    const now = ctx.now();
    const lookup = await provider.getCompetition(entry);
    if (lookup.status === "unavailable") {
      await saveCompetition(db, provider.id, entry, `unavailable:${entry.slug}`, "unavailable", lookup.note, null, now);
      notes.push(`${entry.slug}: niet beschikbaar`);
      continue;
    }
    const remote = lookup.competition;
    if (!entry.expect.test(remote.name)) {
      await saveCompetition(
        db,
        provider.id,
        entry,
        remote.externalId,
        "mismatch",
        `De databron noemt deze competitie "${remote.name}".`,
        remote,
        now,
      );
      notes.push(`${entry.slug}: naam komt niet overeen ("${remote.name}")`);
      continue;
    }
    const competitionId = await saveCompetition(db, provider.id, entry, remote.externalId, "available", null, remote, now);
    const current = remote.seasons.find((s) => s.isCurrent) ?? remote.seasons[0];
    const previous = remote.seasons
      .filter((s) => s !== current && current && s.startYear < current.startYear)
      .sort((a, b) => b.startYear - a.startYear)[0];
    await saveSeasons(
      db,
      provider.id,
      competitionId,
      [current, previous].filter((s) => s !== undefined),
    );
    available++;
  }
  return {
    items: available,
    message: `${available} competities beschikbaar${notes.length ? `; ${notes.join("; ")}` : ""}`,
    nextDueInSeconds: 24 * HOUR,
  };
}

export async function syncTeams(ctx: JobContext): Promise<JobResult> {
  let count = 0;
  for (const c of await activeCompetitions(ctx.db, ctx.provider.id)) {
    if (!c.current_season_id || !c.season_external_id) continue;
    const teams = await ctx.provider.getSeasonTeams(c.season_external_id);
    const ids = await saveTeams(ctx.db, ctx.provider.id, teams);
    await linkSeasonTeams(ctx.db, c.current_season_id, [...ids.values()]);
    count += ids.size;
  }
  return { items: count, message: `${count} teams bijgewerkt`, nextDueInSeconds: 24 * HOUR };
}

async function storeWithDetails(ctx: JobContext, matches: ProviderMatch[]) {
  const now = ctx.now();
  const mctx = await matchContext(ctx.db, ctx.provider.id, now);
  const written = await saveMatches(ctx.db, mctx, matches);
  let detailChanges = 0;
  for (const m of matches) {
    const id = written.ids.get(m.externalId);
    if (id && (m.details.events || m.details.lineups || m.details.statistics)) {
      if (await saveMatchDetails(ctx.db, id, m, m.details, now)) detailChanges++;
    }
  }
  return { written, detailChanges };
}

/** Fixtures from yesterday to a week ahead: catches new kick-off times and postponements. */
export async function syncNearFixtures(ctx: JobContext): Promise<JobResult> {
  const comps = await activeCompetitions(ctx.db, ctx.provider.id);
  if (comps.length === 0) return { items: 0, message: "Geen beschikbare competities", nextDueInSeconds: HOUR };
  const now = ctx.now();
  const matches = await ctx.provider.getMatchesBetween(
    comps.map((c) => c.external_id),
    utcDate(new Date(now.getTime() - 86_400_000)),
    utcDate(new Date(now.getTime() + 7 * 86_400_000)),
  );
  const mctx = await matchContext(ctx.db, ctx.provider.id, now);
  const w = await saveMatches(ctx.db, mctx, matches);
  return {
    items: matches.length,
    message: `${matches.length} wedstrijden (${w.inserted} nieuw, ${w.changed} gewijzigd${w.skipped ? `, ${w.skipped} overgeslagen: onbekend seizoen` : ""})`,
    nextDueInSeconds: 30 * 60,
  };
}

/** Complete fixture list of one season, in date windows the provider accepts. */
export async function syncSeasonFixtures(ctx: JobContext, slug: string, which: "current" | "previous"): Promise<JobResult> {
  const { db, provider } = ctx;
  const [season] = await db.query<{
    id: number;
    external_id: string;
    competition_external_id: string;
    starts_on: string | null;
    ends_on: string | null;
  }>(
    `select s.id, s.external_id, c.external_id as competition_external_id, to_char(s.starts_on, 'YYYY-MM-DD') as starts_on, to_char(s.ends_on, 'YYYY-MM-DD') as ends_on
     from seasons s join competitions c on c.id = s.competition_id
     where c.provider = $1 and c.slug = $2 and c.availability = 'available' and s.is_current = $3
     order by s.start_year desc limit 1`,
    [provider.id, slug, which === "current"],
  );
  if (!season) return { items: 0, message: `Geen ${which === "current" ? "huidig" : "vorig"} seizoen bekend`, nextDueInSeconds: 6 * HOUR };
  const today = utcDate(ctx.now());
  const from = season.starts_on ?? addDays(today, -200);
  const to = season.ends_on ?? addDays(today, 200);
  const all: ProviderMatch[] = [];
  for (let start = from; start <= to; start = addDays(start, 90)) {
    const end = addDays(start, 89) < to ? addDays(start, 89) : to;
    all.push(...(await provider.getMatchesBetween([season.competition_external_id], start, end)));
  }
  const ofSeason = all.filter((m) => m.seasonExternalId === season.external_id);
  const mctx = await matchContext(db, provider.id, ctx.now());
  const w = await saveMatches(db, mctx, ofSeason);
  // Only a complete, successful read may remove fixtures the source no longer lists.
  const pruned =
    ofSeason.length > 0
      ? await pruneSeasonMatches(
          db,
          provider.id,
          season.id,
          ofSeason.map((m) => m.externalId),
        )
      : 0;
  return {
    items: ofSeason.length,
    message: `${ofSeason.length} wedstrijden (${w.inserted} nieuw, ${w.changed} gewijzigd${pruned ? `, ${pruned} verwijderd door de databron` : ""})`,
    nextDueInSeconds: which === "current" ? 12 * HOUR : 30 * 24 * HOUR,
  };
}

/**
 * Live matches, matches about to start (line-ups) and matches that just ended (final score and
 * statistics), with full details. Poll frequency follows what is actually happening.
 */
export async function syncLive(ctx: JobContext): Promise<JobResult> {
  const now = ctx.now();
  const candidates = await ctx.db.query<{ external_id: string; status: string }>(
    `select external_id, status from matches
     where provider = $1 and (
       status = any($2::text[])
       or (status = any($3::text[]) and kickoff_at between $5 and $6)
       or (status = any($4::text[]) and kickoff_at > $7 and (details_synced_at is null or details_synced_at < kickoff_at + interval '150 minutes' or changed_at > $8))
     )
     order by kickoff_at
     limit 200`,
    [
      ctx.provider.id,
      LIVE,
      NOT_STARTED,
      FINISHED,
      new Date(now.getTime() - 4 * HOUR * 1000),
      new Date(now.getTime() + 60 * 60_000),
      new Date(now.getTime() - 6 * HOUR * 1000),
      new Date(now.getTime() - 20 * 60_000),
    ],
  );
  if (candidates.length === 0) return { items: 0, message: "Geen live of aanstaande wedstrijden", nextDueInSeconds: 300 };

  const matches = await ctx.provider.getMatchesByIds(candidates.map((c) => c.external_id));
  const { written, detailChanges } = await storeWithDetails(ctx, matches);
  const liveNow = matches.some((m) => isLive(m.status));
  if (matches.some((m) => isFinished(m.status)) && written.changed + written.inserted > 0) await markDue(ctx.db, "standings", now);
  return {
    items: matches.length,
    message: `${matches.length} wedstrijden ververst (${written.changed} gewijzigd, ${detailChanges} met nieuwe details)`,
    nextDueInSeconds: liveNow ? ctx.cfg.livePollSeconds : 180,
  };
}

/** Details for recently finished matches that were never fetched in full (e.g. after a backfill). */
export async function syncDetailsBackfill(ctx: JobContext): Promise<JobResult> {
  const now = ctx.now();
  const rows = await ctx.db.query<{ external_id: string }>(
    `select m.external_id from matches m join seasons s on s.id = m.season_id
     where m.provider = $1 and s.is_current and m.status = any($2::text[]) and m.kickoff_at between $3 and $4 and m.details_synced_at is null
     order by m.kickoff_at desc limit 51`,
    [ctx.provider.id, FINISHED, new Date(now.getTime() - 21 * 24 * HOUR * 1000), new Date(now.getTime() - 3 * HOUR * 1000)],
  );
  const batch = rows.slice(0, 50);
  if (batch.length === 0) return { items: 0, message: "Alle recente wedstrijden hebben details", nextDueInSeconds: 6 * HOUR };
  const matches = await ctx.provider.getMatchesByIds(batch.map((r) => r.external_id));
  await storeWithDetails(ctx, matches);
  return {
    items: matches.length,
    message: `Details opgehaald voor ${matches.length} wedstrijden`,
    nextDueInSeconds: rows.length > 50 ? 10 * 60 : 6 * HOUR,
  };
}

/** Official standings, refreshed after results change and at least twice a day. */
export async function syncStandings(ctx: JobContext): Promise<JobResult> {
  const now = ctx.now();
  const due = await ctx.db.query<{ id: number; external_id: string }>(
    `select s.id, s.external_id from seasons s join competitions c on c.id = s.competition_id
     where c.provider = $1 and c.availability = 'available' and s.is_current and (
       s.standings_synced_at is null or s.standings_synced_at < $2
       or exists (select 1 from matches m where m.season_id = s.id and m.status = any($3::text[]) and m.changed_at > s.standings_synced_at)
     )`,
    [ctx.provider.id, new Date(now.getTime() - 12 * HOUR * 1000), FINISHED],
  );
  let changed = 0;
  for (const s of due) {
    const rows = await ctx.provider.getStandings(s.external_id);
    if (await saveStandings(ctx.db, ctx.provider.id, s.id, rows, ctx.now())) changed++;
  }
  return { items: due.length, message: `${due.length} standen gecontroleerd, ${changed} gewijzigd`, nextDueInSeconds: 30 * 60 };
}

/** Housekeeping: logs and superseded analyses are not kept forever. */
export async function maintenance(ctx: JobContext): Promise<JobResult> {
  const now = ctx.now();
  const days = (n: number) => new Date(now.getTime() - n * 24 * HOUR * 1000);
  const runs = await ctx.db.query(`delete from sync_runs where started_at < $1 returning id`, [days(30)]);
  await ctx.db.query(`delete from rate_events where created_at < $1`, [days(2)]);
  await ctx.db.query(`delete from provider_usage where day < $1`, [days(120)]);
  const analyses = await ctx.db.query(
    `delete from ai_analyses a where a.created_at < $1 and (a.status <> 'ok' or exists (
       select 1 from ai_analyses b where b.match_id = a.match_id and b.kind = a.kind and b.status = 'ok' and b.created_at > a.created_at))
     returning id`,
    [days(30)],
  );
  return {
    items: runs.length + analyses.length,
    message: `${runs.length} logregels en ${analyses.length} oude analyses opgeruimd`,
    nextDueInSeconds: 24 * HOUR,
  };
}
