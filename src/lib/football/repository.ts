import "server-only";
import { createHash } from "node:crypto";
import type { CatalogCompetition } from "./catalog";
import type { Db } from "@/lib/db";
import type { ProviderCompetition, ProviderMatch, ProviderMatchDetails, ProviderSeason, ProviderStanding, ProviderTeam } from "./model";
import { slugify } from "@/lib/slug";

/**
 * Write side of the football data. Every function is idempotent: running the same input twice
 * leaves the database exactly as after the first run. External ids are unique per provider.
 */

export function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

/** "$1, $2, $3" groups for a multi-row VALUES clause. */
function values(rows: unknown[][]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const groups = rows.map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(", ")})`);
  return { sql: groups.join(", "), params };
}

async function chunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

export type Availability = "available" | "unavailable" | "mismatch" | "error";

export async function saveCompetition(
  db: Db,
  provider: string,
  entry: CatalogCompetition,
  externalId: string,
  availability: Availability,
  note: string | null,
  remote: ProviderCompetition | null,
  now: Date,
): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    `insert into competitions (provider, external_id, slug, name, country, country_code, kind, logo_url, sort_order, availability, availability_note, availability_checked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (provider, slug) do update set
       external_id = excluded.external_id, name = excluded.name, country = excluded.country, country_code = excluded.country_code,
       kind = excluded.kind, logo_url = coalesce(excluded.logo_url, competitions.logo_url), sort_order = excluded.sort_order,
       availability = excluded.availability, availability_note = excluded.availability_note,
       availability_checked_at = excluded.availability_checked_at, updated_at = now()
     returning id`,
    [
      provider,
      externalId,
      entry.slug,
      entry.name,
      entry.country,
      entry.countryCode,
      entry.kind,
      remote?.logoUrl ?? null,
      entry.sortOrder,
      availability,
      note,
      now,
    ],
  );
  return row.id;
}

export async function saveSeasons(
  db: Db,
  provider: string,
  competitionId: number,
  seasons: ProviderSeason[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const s of seasons) {
    const [row] = await db.query<{ id: number }>(
      `insert into seasons (provider, external_id, competition_id, name, slug, start_year, starts_on, ends_on, is_current)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (provider, external_id) do update set
         name = excluded.name, slug = excluded.slug, start_year = excluded.start_year, starts_on = excluded.starts_on,
         ends_on = excluded.ends_on, is_current = excluded.is_current, updated_at = now()
       returning id`,
      [provider, s.externalId, competitionId, s.name, slugify(s.name), s.startYear, s.startsOn, s.endsOn, s.isCurrent],
    );
    ids.set(s.externalId, row.id);
  }
  const current = seasons.find((s) => s.isCurrent);
  if (current) {
    const currentId = ids.get(current.externalId)!;
    await db.query(`update seasons set is_current = (id = $2) where competition_id = $1`, [competitionId, currentId]);
    await db.query(`update competitions set current_season_id = $2, updated_at = now() where id = $1`, [competitionId, currentId]);
  }
  return ids;
}

export async function saveTeams(db: Db, provider: string, teams: ProviderTeam[]): Promise<Map<string, number>> {
  const unique = [...new Map(teams.map((t) => [t.externalId, t])).values()];
  const ids = new Map<string, number>();
  await chunked(unique, 200, async (chunk) => {
    const v = values(
      chunk.map((t) => [
        provider,
        t.externalId,
        t.name,
        t.shortName,
        t.code,
        slugify(t.name),
        t.country,
        t.founded,
        t.logoUrl,
        t.venueName,
        t.venueCity,
        t.isPlaceholder,
      ]),
    );
    // Partial knowledge never wipes better data: a fixture payload has no venue, a team list does.
    const rows = await db.query<{ id: number; external_id: string }>(
      `insert into teams (provider, external_id, name, short_name, code, slug, country, founded, logo_url, venue_name, venue_city, is_placeholder)
       values ${v.sql}
       on conflict (provider, external_id) do update set
         name = excluded.name, slug = excluded.slug,
         short_name = coalesce(excluded.short_name, teams.short_name), code = coalesce(excluded.code, teams.code),
         country = coalesce(excluded.country, teams.country), founded = coalesce(excluded.founded, teams.founded),
         logo_url = coalesce(excluded.logo_url, teams.logo_url), venue_name = coalesce(excluded.venue_name, teams.venue_name),
         venue_city = coalesce(excluded.venue_city, teams.venue_city), is_placeholder = excluded.is_placeholder, updated_at = now()
       returning id, external_id`,
      v.params,
    );
    for (const r of rows) ids.set(r.external_id, r.id);
  });
  return ids;
}

export async function linkSeasonTeams(db: Db, seasonId: number, teamIds: number[]) {
  if (teamIds.length === 0) return;
  const v = values([...new Set(teamIds)].map((id) => [seasonId, id]));
  await db.query(`insert into season_teams (season_id, team_id) values ${v.sql} on conflict do nothing`, v.params);
}

export interface MatchContext {
  provider: string;
  competitionIds: Map<string, number>;
  seasonIds: Map<string, number>;
  now: Date;
}

export interface MatchWriteResult {
  inserted: number;
  changed: number;
  unchanged: number;
  skipped: number;
  ids: Map<string, number>;
}

function coreOf(m: ProviderMatch) {
  return [
    m.kickoffAt.toISOString(),
    m.status,
    m.providerStatus,
    m.minute,
    m.minuteExtra,
    m.home.externalId,
    m.away.externalId,
    m.score,
    m.halftime,
    m.extraTime,
    m.penalties,
    m.stageName,
    m.roundName,
    m.venueName,
    m.referee,
  ];
}

/**
 * Inserts or updates matches by (provider, external_id). `synced_at` always moves forward (the
 * source confirmed the record); `changed_at` only when something visible changed.
 * Matches whose competition or season is unknown locally are skipped, never guessed.
 */
export async function saveMatches(db: Db, ctx: MatchContext, matches: ProviderMatch[]): Promise<MatchWriteResult> {
  const result: MatchWriteResult = { inserted: 0, changed: 0, unchanged: 0, skipped: 0, ids: new Map() };
  const usable = [...new Map(matches.map((m) => [m.externalId, m])).values()].filter((m) => {
    const ok = ctx.competitionIds.has(m.competitionExternalId) && ctx.seasonIds.has(m.seasonExternalId);
    if (!ok) result.skipped++;
    return ok;
  });
  if (usable.length === 0) return result;
  const teamIds = await saveTeams(
    db,
    ctx.provider,
    usable.flatMap((m) => [m.home, m.away]),
  );

  await chunked(usable, 100, async (chunk) => {
    const before = new Map(
      (
        await db.query<{ external_id: string; core_hash: string }>(
          `select external_id, core_hash from matches where provider = $1 and external_id = any($2::text[])`,
          [ctx.provider, chunk.map((m) => m.externalId)],
        )
      ).map((r) => [r.external_id, r.core_hash]),
    );
    const v = values(
      chunk.map((m) => [
        ctx.provider,
        m.externalId,
        ctx.competitionIds.get(m.competitionExternalId),
        ctx.seasonIds.get(m.seasonExternalId),
        m.stageName,
        m.roundName,
        m.kickoffAt,
        m.status,
        m.providerStatus,
        m.minute,
        m.minuteExtra,
        teamIds.get(m.home.externalId),
        teamIds.get(m.away.externalId),
        m.score.home,
        m.score.away,
        m.halftime.home,
        m.halftime.away,
        m.extraTime.home,
        m.extraTime.away,
        m.penalties.home,
        m.penalties.away,
        m.venueName,
        m.venueCity,
        m.referee,
        stableHash(coreOf(m)),
        ctx.now,
        ctx.now,
      ]),
    );
    const rows = await db.query<{ id: number; external_id: string; core_hash: string }>(
      `insert into matches (provider, external_id, competition_id, season_id, stage_name, round_name, kickoff_at, status, provider_status,
         minute, minute_extra, home_team_id, away_team_id, home_score, away_score, ht_home, ht_away, et_home, et_away, pen_home, pen_away,
         venue_name, venue_city, referee, core_hash, synced_at, changed_at)
       values ${v.sql}
       on conflict (provider, external_id) do update set
         competition_id = excluded.competition_id, season_id = excluded.season_id, stage_name = excluded.stage_name,
         round_name = excluded.round_name, kickoff_at = excluded.kickoff_at, status = excluded.status,
         provider_status = excluded.provider_status, minute = excluded.minute, minute_extra = excluded.minute_extra,
         home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_score = excluded.home_score,
         away_score = excluded.away_score, ht_home = excluded.ht_home, ht_away = excluded.ht_away, et_home = excluded.et_home,
         et_away = excluded.et_away, pen_home = excluded.pen_home, pen_away = excluded.pen_away,
         venue_name = coalesce(excluded.venue_name, matches.venue_name), venue_city = coalesce(excluded.venue_city, matches.venue_city),
         referee = coalesce(excluded.referee, matches.referee), core_hash = excluded.core_hash,
         synced_at = greatest(matches.synced_at, excluded.synced_at),
         changed_at = case when matches.core_hash is distinct from excluded.core_hash then excluded.changed_at else matches.changed_at end
       returning id, external_id, core_hash`,
      v.params,
    );
    for (const r of rows) {
      result.ids.set(r.external_id, r.id);
      const previous = before.get(r.external_id);
      if (previous === undefined) result.inserted++;
      else if (previous !== r.core_hash) result.changed++;
      else result.unchanged++;
    }
  });
  return result;
}

type Side = "home" | "away";

/**
 * Replaces events, line-ups and statistics of one match when the provider's version differs from
 * what we stored. Parts the provider did not send (undefined) are left untouched.
 */
export async function saveMatchDetails(
  db: Db,
  matchId: number,
  match: ProviderMatch,
  details: ProviderMatchDetails,
  now: Date,
): Promise<boolean> {
  const sideOf = (teamExternalId: string | null): Side | null =>
    teamExternalId === match.home.externalId ? "home" : teamExternalId === match.away.externalId ? "away" : null;
  const [current] = await db.query<{ events_hash: string | null; lineups_hash: string | null; stats_hash: string | null }>(
    `select events_hash, lineups_hash, stats_hash from matches where id = $1`,
    [matchId],
  );
  if (!current) return false;
  let changed = false;

  await db.transaction(async (tx) => {
    if (details.events) {
      const hash = stableHash(details.events);
      if (hash !== current.events_hash) {
        changed = true;
        await tx.query(`delete from match_events where match_id = $1`, [matchId]);
        if (details.events.length > 0) {
          const v = values(
            details.events.map((e, i) => [
              matchId,
              i,
              e.minute,
              e.minuteExtra,
              sideOf(e.teamExternalId),
              e.type,
              e.playerName,
              e.playerExternalId,
              e.relatedName,
              e.relatedExternalId,
              e.detail,
              e.scoreAfter,
            ]),
          );
          await tx.query(
            `insert into match_events (match_id, seq, minute, minute_extra, side, type, player_name, player_external_id, related_name, related_external_id, detail, score_after)
             values ${v.sql}`,
            v.params,
          );
        }
        await tx.query(`update matches set events_hash = $2 where id = $1`, [matchId, hash]);
      }
    }
    if (details.lineups) {
      const hash = stableHash(details.lineups);
      if (hash !== current.lineups_hash) {
        changed = true;
        await tx.query(`delete from match_lineup_players where match_id = $1`, [matchId]);
        await tx.query(`delete from match_lineups where match_id = $1`, [matchId]);
        for (const lineup of details.lineups) {
          const side = sideOf(lineup.teamExternalId);
          if (!side) continue;
          await tx.query(`insert into match_lineups (match_id, side, formation, coach_name) values ($1, $2, $3, $4)`, [
            matchId,
            side,
            lineup.formation,
            lineup.coachName,
          ]);
          const players = [
            ...lineup.starters.map((p) => ({ p, starter: true })),
            ...lineup.substitutes.map((p) => ({ p, starter: false })),
          ];
          if (players.length > 0) {
            const v = values(
              players.map(({ p, starter }, i) => [matchId, side, i, starter, p.externalId, p.name, p.number, p.position, p.grid]),
            );
            await tx.query(
              `insert into match_lineup_players (match_id, side, sort, is_starter, player_external_id, name, number, position, grid) values ${v.sql}`,
              v.params,
            );
          }
        }
        await tx.query(`update matches set lineups_hash = $2 where id = $1`, [matchId, hash]);
      }
    }
    if (details.statistics) {
      const hash = stableHash(details.statistics);
      if (hash !== current.stats_hash) {
        changed = true;
        await tx.query(`delete from match_statistics where match_id = $1`, [matchId]);
        const rows: unknown[][] = [];
        for (const team of details.statistics) {
          const side = sideOf(team.teamExternalId);
          if (!side) continue;
          for (const [key, value] of Object.entries(team.values)) rows.push([matchId, side, key, value ?? null]);
        }
        if (rows.length > 0) {
          const v = values(rows);
          await tx.query(`insert into match_statistics (match_id, side, key, value) values ${v.sql}`, v.params);
        }
        await tx.query(`update matches set stats_hash = $2 where id = $1`, [matchId, hash]);
      }
    }
    await tx.query(`update matches set details_synced_at = $2 where id = $1`, [matchId, now]);
  });
  return changed;
}

/** Replaces the standings of a season when they differ from what we stored. */
export async function saveStandings(
  db: Db,
  provider: string,
  seasonId: number,
  rows: ProviderStanding[] | null,
  now: Date,
): Promise<boolean> {
  if (rows === null) {
    await db.query(`update seasons set standings_available = false, standings_synced_at = $2 where id = $1`, [seasonId, now]);
    return false;
  }
  const hash = stableHash(rows);
  const [season] = await db.query<{ standings_hash: string | null }>(`select standings_hash from seasons where id = $1`, [seasonId]);
  if (season?.standings_hash === hash) {
    await db.query(`update seasons set standings_synced_at = $2, standings_available = true where id = $1`, [seasonId, now]);
    return false;
  }
  const teamIds = await saveTeams(
    db,
    provider,
    rows.map((r) => r.team),
  );
  const unique = [...new Map(rows.map((r) => [`${r.groupName}|${r.team.externalId}`, r])).values()];
  await db.transaction(async (tx) => {
    await tx.query(`delete from standings where season_id = $1`, [seasonId]);
    await chunked(unique, 100, async (chunk) => {
      const v = values(
        chunk.map((r) => [
          seasonId,
          r.groupName,
          teamIds.get(r.team.externalId),
          r.rank,
          r.points,
          r.played,
          r.won,
          r.drawn,
          r.lost,
          r.goalsFor,
          r.goalsAgainst,
          r.goalDiff,
          r.form,
          r.description,
        ]),
      );
      await tx.query(
        `insert into standings (season_id, group_name, team_id, rank, points, played, won, drawn, lost, goals_for, goals_against, goal_diff, form, description)
         values ${v.sql}`,
        v.params,
      );
    });
    await tx.query(`update seasons set standings_hash = $2, standings_synced_at = $3, standings_available = true where id = $1`, [
      seasonId,
      hash,
      now,
    ]);
  });
  await linkSeasonTeams(db, seasonId, [...teamIds.values()]);
  return true;
}

/** Removes matches of a fully re-read season that the source no longer lists (withdrawn fixtures). */
export async function pruneSeasonMatches(db: Db, provider: string, seasonId: number, keepExternalIds: string[]): Promise<number> {
  if (keepExternalIds.length === 0) return 0;
  const rows = await db.query<{ id: number }>(
    `delete from matches where provider = $1 and season_id = $2 and not (external_id = any($3::text[])) returning id`,
    [provider, seasonId, keepExternalIds],
  );
  return rows.length;
}
