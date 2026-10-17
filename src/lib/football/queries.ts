import "server-only";
import type { Db } from "@/lib/db";
import type { AppConfig } from "@/lib/env";
import { competitionPath, matchSlug, teamPath, withId } from "@/lib/slug";
import { localDay, localDayRange } from "@/lib/time";
import { freshnessOf } from "./freshness";
import { STAT_KEYS, type CompetitionRef, type EventType, type MatchSummary, type StatKey, type TeamRef } from "./model";
import { isMatchStatus, MATCH_STATUSES, isFinished, isUpcoming, isLive, type MatchStatus } from "./status";

/** Read side: everything pages and the public API show comes through here, scoped to one provider. */

interface MatchRow {
  id: number;
  kickoff_at: Date;
  status: string;
  minute: number | null;
  minute_extra: number | null;
  home_score: number | null;
  away_score: number | null;
  ht_home: number | null;
  ht_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
  stage_name: string | null;
  round_name: string | null;
  synced_at: Date;
  season_id: number;
  c_id: number;
  c_slug: string;
  c_name: string;
  c_country: string;
  c_cc: string | null;
  h_id: number;
  h_name: string;
  h_short: string | null;
  h_slug: string;
  h_logo: string | null;
  a_id: number;
  a_name: string;
  a_short: string | null;
  a_slug: string;
  a_logo: string | null;
}

const MATCH_SELECT = `
  select m.id, m.kickoff_at, m.status, m.minute, m.minute_extra, m.home_score, m.away_score, m.ht_home, m.ht_away, m.pen_home, m.pen_away,
         m.stage_name, m.round_name, m.synced_at, m.season_id,
         c.id as c_id, c.slug as c_slug, c.name as c_name, c.country as c_country, c.country_code as c_cc,
         h.id as h_id, h.name as h_name, h.short_name as h_short, h.slug as h_slug, h.logo_url as h_logo,
         a.id as a_id, a.name as a_name, a.short_name as a_short, a.slug as a_slug, a.logo_url as a_logo
  from matches m
  join competitions c on c.id = m.competition_id
  join teams h on h.id = m.home_team_id
  join teams a on a.id = m.away_team_id`;

export interface ReadContext {
  db: Db;
  cfg: AppConfig;
  provider: string;
  now: Date;
}

export function matchPath(id: number, home: string, away: string, kickoff: Date) {
  return `/wedstrijd/${withId(matchSlug(home, away, localDay(kickoff)), id)}`;
}

function toSummary(r: MatchRow, ctx: ReadContext): MatchSummary {
  const status: MatchStatus = isMatchStatus(r.status) ? r.status : "unknown";
  const kickoff = new Date(r.kickoff_at);
  const synced = new Date(r.synced_at);
  const logos = ctx.cfg.showProviderLogos;
  const team = (id: number, name: string, short: string | null, slug: string, logo: string | null): TeamRef => ({
    id,
    name,
    shortName: short,
    slug,
    logoUrl: logos ? logo : null,
  });
  return {
    id: r.id,
    path: matchPath(r.id, r.h_name, r.a_name, kickoff),
    competition: { id: r.c_id, slug: r.c_slug, name: r.c_name, country: r.c_country, countryCode: r.c_cc },
    seasonId: r.season_id,
    stageName: r.stage_name,
    roundName: r.round_name,
    kickoffAt: kickoff.toISOString(),
    status,
    minute: r.minute,
    minuteExtra: r.minute_extra,
    home: team(r.h_id, r.h_name, r.h_short, r.h_slug, r.h_logo),
    away: team(r.a_id, r.a_name, r.a_short, r.a_slug, r.a_logo),
    score: { home: r.home_score, away: r.away_score },
    halftime: { home: r.ht_home, away: r.ht_away },
    penalties: { home: r.pen_home, away: r.pen_away },
    syncedAt: synced.toISOString(),
    freshness: freshnessOf(status, kickoff, synced, ctx.now, ctx.cfg.livePollSeconds),
  };
}

async function matches(ctx: ReadContext, where: string, params: unknown[], order = "m.kickoff_at, c.sort_order, m.id", limit = 500) {
  const rows = await ctx.db.query<MatchRow>(
    `${MATCH_SELECT} where m.provider = $1 and c.availability = 'available' and ${where} order by ${order} limit ${limit}`,
    [ctx.provider, ...params],
  );
  return rows.map((r) => toSummary(r, ctx));
}

const FINISHED = MATCH_STATUSES.filter(isFinished);
const UPCOMING = MATCH_STATUSES.filter(isUpcoming);
const LIVE = MATCH_STATUSES.filter(isLive);

/* ----------------------------------------------------------------------------------------- */

export interface DayBoard {
  day: string;
  matches: MatchSummary[];
}

export async function getDayBoard(ctx: ReadContext, day: string): Promise<DayBoard> {
  const { start, end } = localDayRange(day);
  return { day, matches: await matches(ctx, `m.kickoff_at >= $2 and m.kickoff_at < $3`, [start, end], "c.sort_order, m.kickoff_at, m.id") };
}

/** A cheap stamp that changes whenever anything visible about the match changes. */
export async function getMatchVersion(ctx: ReadContext, id: number) {
  const [row] = await ctx.db.query<{ id: number; status: string; synced_at: Date; v: string }>(
    `select id, status, synced_at, concat_ws(':', core_hash, events_hash, lineups_hash, stats_hash) as v from matches where provider = $1 and id = $2`,
    [ctx.provider, id],
  );
  if (!row) return null;
  return { id: row.id, status: row.status, syncedAt: new Date(row.synced_at).toISOString(), version: row.v };
}

/** Only the matches that can change soon; used by the live refresh endpoint. */
export async function getMatchesByIds(ctx: ReadContext, ids: number[]) {
  if (ids.length === 0) return [];
  return matches(ctx, `m.id = any($2::int[])`, [ids]);
}

export interface CompetitionListItem extends CompetitionRef {
  kind: "league" | "cup";
  availability: string;
  availabilityNote: string | null;
  checkedAt: string | null;
  seasonName: string | null;
  matchCount: number;
}

export async function getCompetitions(ctx: ReadContext): Promise<CompetitionListItem[]> {
  const rows = await ctx.db.query<{
    id: number;
    slug: string;
    name: string;
    country: string;
    country_code: string | null;
    kind: "league" | "cup";
    availability: string;
    availability_note: string | null;
    availability_checked_at: Date | null;
    season_name: string | null;
    match_count: number;
  }>(
    `select c.id, c.slug, c.name, c.country, c.country_code, c.kind, c.availability, c.availability_note, c.availability_checked_at,
            s.name as season_name, (select count(*)::int from matches m where m.season_id = s.id) as match_count
     from competitions c left join seasons s on s.id = c.current_season_id
     where c.provider = $1 order by c.sort_order`,
    [ctx.provider],
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    country: r.country,
    countryCode: r.country_code,
    kind: r.kind,
    availability: r.availability,
    availabilityNote: r.availability_note,
    checkedAt: r.availability_checked_at ? new Date(r.availability_checked_at).toISOString() : null,
    seasonName: r.season_name,
    matchCount: r.match_count,
  }));
}

export interface SeasonRef {
  id: number;
  name: string;
  slug: string;
  isCurrent: boolean;
  standingsAvailable: boolean | null;
  standingsSyncedAt: string | null;
}

export interface CompetitionPage {
  competition: CompetitionRef & { kind: "league" | "cup" };
  seasons: SeasonRef[];
  season: SeasonRef;
}

/** A competition with one of its seasons: the requested one, or the current one. */
export async function getCompetitionPage(ctx: ReadContext, slug: string, seasonSlug?: string): Promise<CompetitionPage | null> {
  const [c] = await ctx.db.query<{
    id: number;
    slug: string;
    name: string;
    country: string;
    country_code: string | null;
    kind: "league" | "cup";
    current_season_id: number | null;
  }>(
    `select id, slug, name, country, country_code, kind, current_season_id from competitions where provider = $1 and slug = $2 and availability = 'available'`,
    [ctx.provider, slug],
  );
  if (!c) return null;
  const seasonRows = await ctx.db.query<{
    id: number;
    name: string;
    slug: string;
    is_current: boolean;
    standings_available: boolean | null;
    standings_synced_at: Date | null;
  }>(
    `select id, name, slug, is_current, standings_available, standings_synced_at from seasons s
     where competition_id = $1 and exists (select 1 from matches m where m.season_id = s.id)
     order by start_year desc`,
    [c.id],
  );
  const seasons: SeasonRef[] = seasonRows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    isCurrent: s.is_current,
    standingsAvailable: s.standings_available,
    standingsSyncedAt: s.standings_synced_at ? new Date(s.standings_synced_at).toISOString() : null,
  }));
  const season = seasonSlug ? seasons.find((s) => s.slug === seasonSlug) : (seasons.find((s) => s.isCurrent) ?? seasons[0]);
  if (!season) return null;
  return {
    competition: { id: c.id, slug: c.slug, name: c.name, country: c.country, countryCode: c.country_code, kind: c.kind },
    seasons,
    season,
  };
}

export async function getSeasonMatches(ctx: ReadContext, seasonId: number, which: "results" | "fixtures" | "all") {
  if (which === "results")
    return matches(
      ctx,
      `m.season_id = $2 and (m.status = any($3::text[]) or m.status in ('abandoned', 'suspended'))`,
      [seasonId, FINISHED],
      "m.kickoff_at desc, m.id",
      1000,
    );
  if (which === "fixtures")
    return matches(
      ctx,
      `m.season_id = $2 and (m.status = any($3::text[]) or m.status = any($4::text[]) or m.status in ('postponed', 'cancelled'))`,
      [seasonId, UPCOMING, LIVE],
      "m.kickoff_at, m.id",
      1000,
    );
  return matches(ctx, `m.season_id = $2`, [seasonId], "m.kickoff_at, m.id", 1000);
}

/** The round in play: the round of the next unfinished match, or of the last match. */
export function currentRound(list: MatchSummary[], now: Date): string | null {
  const next = list.find(
    (m) => (isUpcoming(m.status) || isLive(m.status)) && new Date(m.kickoffAt).getTime() > now.getTime() - 3 * 3600_000,
  );
  return (next ?? list[list.length - 1])?.roundName ?? null;
}

export interface StandingRow {
  group: string;
  rank: number;
  team: TeamRef;
  points: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDiff: number | null;
  form: string | null;
  description: string | null;
}

export async function getStandings(ctx: ReadContext, seasonId: number): Promise<StandingRow[]> {
  const rows = await ctx.db.query<{
    group_name: string;
    rank: number;
    points: number | null;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    goals_for: number | null;
    goals_against: number | null;
    goal_diff: number | null;
    form: string | null;
    description: string | null;
    t_id: number;
    t_name: string;
    t_short: string | null;
    t_slug: string;
    t_logo: string | null;
  }>(
    `select st.group_name, st.rank, st.points, st.played, st.won, st.drawn, st.lost, st.goals_for, st.goals_against, st.goal_diff, st.form, st.description,
            t.id as t_id, t.name as t_name, t.short_name as t_short, t.slug as t_slug, t.logo_url as t_logo
     from standings st join teams t on t.id = st.team_id where st.season_id = $1 order by st.group_name, st.rank`,
    [seasonId],
  );
  return rows.map((r) => ({
    group: r.group_name,
    rank: r.rank,
    team: { id: r.t_id, name: r.t_name, shortName: r.t_short, slug: r.t_slug, logoUrl: ctx.cfg.showProviderLogos ? r.t_logo : null },
    points: r.points,
    played: r.played,
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
    goalsFor: r.goals_for,
    goalsAgainst: r.goals_against,
    goalDiff: r.goal_diff,
    form: r.form,
    description: r.description,
  }));
}

/* ----------------------------------------------------------------------------------------- */

export interface TeamPage {
  team: TeamRef & {
    code: string | null;
    country: string | null;
    founded: number | null;
    venueName: string | null;
    venueCity: string | null;
    isPlaceholder: boolean;
  };
  competitions: (CompetitionRef & { seasonId: number; seasonName: string })[];
  recent: MatchSummary[];
  upcoming: MatchSummary[];
  live: MatchSummary[];
  standings: { competition: CompetitionRef; seasonName: string; rows: StandingRow[] }[];
}

export async function getTeamPage(ctx: ReadContext, id: number): Promise<TeamPage | null> {
  const [t] = await ctx.db.query<{
    id: number;
    name: string;
    short_name: string | null;
    slug: string;
    logo_url: string | null;
    code: string | null;
    country: string | null;
    founded: number | null;
    venue_name: string | null;
    venue_city: string | null;
    is_placeholder: boolean;
  }>(
    `select id, name, short_name, slug, logo_url, code, country, founded, venue_name, venue_city, is_placeholder from teams where provider = $1 and id = $2`,
    [ctx.provider, id],
  );
  if (!t) return null;
  const comps = await ctx.db.query<{
    id: number;
    slug: string;
    name: string;
    country: string;
    country_code: string | null;
    season_id: number;
    season_name: string;
  }>(
    `select distinct c.id, c.slug, c.name, c.country, c.country_code, c.sort_order, s.id as season_id, s.name as season_name
     from matches m join competitions c on c.id = m.competition_id join seasons s on s.id = m.season_id
     where m.provider = $1 and (m.home_team_id = $2 or m.away_team_id = $2) and s.is_current and c.availability = 'available'
     order by c.sort_order`,
    [ctx.provider, id],
  );
  const own = `(m.home_team_id = $2 or m.away_team_id = $2)`;
  const recent = await matches(ctx, `${own} and m.status = any($3::text[])`, [id, [...FINISHED, "abandoned"]], "m.kickoff_at desc", 10);
  const upcoming = await matches(
    ctx,
    `${own} and (m.status = any($3::text[]) or m.status = 'postponed') and m.kickoff_at > $4`,
    [id, UPCOMING, new Date(ctx.now.getTime() - 3 * 3600_000)],
    "m.kickoff_at",
    10,
  );
  const live = await matches(ctx, `${own} and m.status = any($3::text[])`, [id, LIVE], "m.kickoff_at", 5);
  const standings = [];
  for (const c of comps) {
    const rows = await getStandings(ctx, c.season_id);
    const groups = new Set(rows.filter((r) => r.team.id === id).map((r) => r.group));
    if (groups.size > 0) {
      standings.push({
        competition: { id: c.id, slug: c.slug, name: c.name, country: c.country, countryCode: c.country_code },
        seasonName: c.season_name,
        rows: rows.filter((r) => groups.has(r.group)),
      });
    }
  }
  return {
    team: {
      id: t.id,
      name: t.name,
      shortName: t.short_name,
      slug: t.slug,
      logoUrl: ctx.cfg.showProviderLogos ? t.logo_url : null,
      code: t.code,
      country: t.country,
      founded: t.founded,
      venueName: t.venue_name,
      venueCity: t.venue_city,
      isPlaceholder: t.is_placeholder,
    },
    competitions: comps.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      country: c.country,
      countryCode: c.country_code,
      seasonId: c.season_id,
      seasonName: c.season_name,
    })),
    recent,
    upcoming,
    live,
    standings,
  };
}

/* ----------------------------------------------------------------------------------------- */

export interface MatchEventView {
  minute: number | null;
  minuteExtra: number | null;
  side: "home" | "away" | null;
  type: EventType;
  playerName: string | null;
  relatedName: string | null;
  detail: string | null;
  scoreAfter: string | null;
}

export interface LineupView {
  formation: string | null;
  coachName: string | null;
  starters: { name: string; number: number | null; position: string | null }[];
  substitutes: { name: string; number: number | null; position: string | null }[];
}

export interface StatView {
  key: StatKey;
  home: number | null;
  away: number | null;
}

export interface MatchDetail {
  match: MatchSummary;
  seasonName: string;
  seasonSlug: string;
  seasonIsCurrent: boolean;
  venueName: string | null;
  venueCity: string | null;
  referee: string | null;
  extraTime: { home: number | null; away: number | null };
  detailsSyncedAt: string | null;
  events: MatchEventView[];
  lineups: { home: LineupView | null; away: LineupView | null };
  /** null = the source supplied no statistics for this match. */
  statistics: StatView[] | null;
  standings: StandingRow[];
  homeRecent: MatchSummary[];
  awayRecent: MatchSummary[];
  headToHead: MatchSummary[];
}

export async function getMatchDetail(ctx: ReadContext, id: number): Promise<MatchDetail | null> {
  const [row] = await ctx.db.query<
    MatchRow & {
      season_name: string;
      season_slug: string;
      is_current: boolean;
      venue_name: string | null;
      venue_city: string | null;
      referee: string | null;
      et_home: number | null;
      et_away: number | null;
      details_synced_at: Date | null;
    }
  >(
    `${MATCH_SELECT.replace("from matches m", ", s.name as season_name, s.slug as season_slug, s.is_current, m.venue_name, m.venue_city, m.referee, m.et_home, m.et_away, m.details_synced_at\n  from matches m")}
     join seasons s on s.id = m.season_id
     where m.provider = $1 and m.id = $2 and c.availability = 'available'`,
    [ctx.provider, id],
  );
  if (!row) return null;
  const match = toSummary(row, ctx);

  const events = await ctx.db.query<{
    minute: number | null;
    minute_extra: number | null;
    side: "home" | "away" | null;
    type: EventType;
    player_name: string | null;
    related_name: string | null;
    detail: string | null;
    score_after: string | null;
  }>(
    `select minute, minute_extra, side, type, player_name, related_name, detail, score_after from match_events where match_id = $1 order by seq`,
    [id],
  );
  const lineupRows = await ctx.db.query<{ side: "home" | "away"; formation: string | null; coach_name: string | null }>(
    `select side, formation, coach_name from match_lineups where match_id = $1`,
    [id],
  );
  const players = await ctx.db.query<{
    side: "home" | "away";
    is_starter: boolean;
    name: string;
    number: number | null;
    position: string | null;
  }>(`select side, is_starter, name, number, position from match_lineup_players where match_id = $1 order by side, sort`, [id]);
  const lineup = (side: "home" | "away"): LineupView | null => {
    const l = lineupRows.find((x) => x.side === side);
    if (!l) return null;
    const mine = players.filter((p) => p.side === side);
    const strip = (p: (typeof mine)[number]) => ({ name: p.name, number: p.number, position: p.position });
    return {
      formation: l.formation,
      coachName: l.coach_name,
      starters: mine.filter((p) => p.is_starter).map(strip),
      substitutes: mine.filter((p) => !p.is_starter).map(strip),
    };
  };
  const statRows = await ctx.db.query<{ side: "home" | "away"; key: string; value: string | number | null }>(
    `select side, key, value from match_statistics where match_id = $1`,
    [id],
  );
  let statistics: StatView[] | null = null;
  if (statRows.length > 0) {
    statistics = STAT_KEYS.filter((k) => statRows.some((r) => r.key === k)).map((key) => {
      const v = (side: "home" | "away") => {
        const hit = statRows.find((r) => r.key === key && r.side === side);
        return hit && hit.value !== null ? Number(hit.value) : null;
      };
      return { key, home: v("home"), away: v("away") };
    });
  }

  const kickoff = new Date(row.kickoff_at);
  const before = `m.kickoff_at < $3 and m.status = any($4::text[])`;
  const recentOf = (teamId: number) =>
    matches(ctx, `(m.home_team_id = $2 or m.away_team_id = $2) and ${before}`, [teamId, kickoff, FINISHED], "m.kickoff_at desc", 5);
  const headToHead = await matches(
    ctx,
    `((m.home_team_id = $2 and m.away_team_id = $5) or (m.home_team_id = $5 and m.away_team_id = $2)) and ${before}`,
    [row.h_id, kickoff, FINISHED, row.a_id],
    "m.kickoff_at desc",
    5,
  );
  const standingsAll = await getStandings(ctx, row.season_id);
  const groups = new Set(standingsAll.filter((r) => r.team.id === row.h_id || r.team.id === row.a_id).map((r) => r.group));

  return {
    match,
    seasonName: row.season_name,
    seasonSlug: row.season_slug,
    seasonIsCurrent: row.is_current,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    referee: row.referee,
    extraTime: { home: row.et_home, away: row.et_away },
    detailsSyncedAt: row.details_synced_at ? new Date(row.details_synced_at).toISOString() : null,
    events: events.map((e) => ({
      minute: e.minute,
      minuteExtra: e.minute_extra,
      side: e.side,
      type: e.type,
      playerName: e.player_name,
      relatedName: e.related_name,
      detail: e.detail,
      scoreAfter: e.score_after,
    })),
    lineups: { home: lineup("home"), away: lineup("away") },
    statistics,
    standings: standingsAll.filter((r) => groups.has(r.group)),
    homeRecent: await recentOf(row.h_id),
    awayRecent: await recentOf(row.a_id),
    headToHead,
  };
}

/* ----------------------------------------------------------------------------------------- */

export interface SearchEntry {
  type: "team" | "competition";
  id: number;
  name: string;
  context: string;
  path: string;
}

/** Compact list for the client-side search: available competitions and their current teams. */
export async function getSearchIndex(ctx: ReadContext): Promise<SearchEntry[]> {
  const comps = await ctx.db.query<{ id: number; slug: string; name: string; country: string }>(
    `select id, slug, name, country from competitions where provider = $1 and availability = 'available' order by sort_order`,
    [ctx.provider],
  );
  const teams = await ctx.db.query<{ id: number; name: string; slug: string; competitions: string }>(
    `select t.id, t.name, t.slug, string_agg(distinct c.name, ', ') as competitions
     from teams t
     join matches m on (m.home_team_id = t.id or m.away_team_id = t.id)
     join seasons s on s.id = m.season_id and s.is_current
     join competitions c on c.id = m.competition_id and c.availability = 'available'
     where t.provider = $1 and not t.is_placeholder
     group by t.id, t.name, t.slug order by t.name`,
    [ctx.provider],
  );
  return [
    ...comps.map((c) => ({ type: "competition" as const, id: c.id, name: c.name, context: c.country, path: competitionPath(c.slug) })),
    ...teams.map((t) => ({ type: "team" as const, id: t.id, name: t.name, context: t.competitions, path: teamPath(t) })),
  ];
}

/** Upcoming, live and recent matches of a visitor's favourite teams and competitions. */
export async function getFavoritesMatches(ctx: ReadContext, teamIds: number[], competitionIds: number[]) {
  const teams = teamIds.length
    ? (
        await ctx.db.query<{ id: number; name: string; slug: string }>(
          `select id, name, slug from teams where provider = $1 and id = any($2::int[]) order by name`,
          [ctx.provider, teamIds],
        )
      ).map((t) => ({ id: t.id, name: t.name, path: teamPath(t) }))
    : [];
  const competitions = competitionIds.length
    ? (
        await ctx.db.query<{ id: number; name: string; slug: string }>(
          `select id, name, slug from competitions where provider = $1 and id = any($2::int[]) order by sort_order`,
          [ctx.provider, competitionIds],
        )
      ).map((c) => ({ id: c.id, name: c.name, path: competitionPath(c.slug) }))
    : [];
  if (teamIds.length === 0 && competitionIds.length === 0) return { teams, competitions, live: [], upcoming: [], recent: [] };
  const who = `(m.home_team_id = any($2::int[]) or m.away_team_id = any($2::int[]) or m.competition_id = any($3::int[]))`;
  const from = new Date(ctx.now.getTime() - 7 * 86_400_000);
  const to = new Date(ctx.now.getTime() + 14 * 86_400_000);
  const list = await matches(ctx, `${who} and m.kickoff_at between $4 and $5`, [teamIds, competitionIds, from, to], "m.kickoff_at", 300);
  return {
    teams,
    competitions,
    live: list.filter((m) => isLive(m.status)),
    upcoming: list.filter((m) => isUpcoming(m.status) && new Date(m.kickoffAt) >= new Date(ctx.now.getTime() - 3 * 3600_000)).slice(0, 30),
    recent: list
      .filter((m) => isFinished(m.status) || m.status === "postponed" || m.status === "cancelled" || m.status === "abandoned")
      .reverse()
      .slice(0, 30),
  };
}

export async function getSitemapData(ctx: ReadContext) {
  const comps = await ctx.db.query<{ slug: string; updated_at: Date }>(
    `select slug, updated_at from competitions where provider = $1 and availability = 'available'`,
    [ctx.provider],
  );
  const teams = await ctx.db.query<{ id: number; slug: string; updated_at: Date }>(
    `select distinct t.id, t.slug, t.updated_at from teams t join season_teams st on st.team_id = t.id join seasons s on s.id = st.season_id and s.is_current
     where t.provider = $1 and not t.is_placeholder`,
    [ctx.provider],
  );
  // Only matches with real content: played, or scheduled within two weeks with both teams known.
  const list = await ctx.db.query<{ id: number; home: string; away: string; kickoff_at: Date; changed_at: Date }>(
    `select m.id, h.name as home, a.name as away, m.kickoff_at, m.changed_at
     from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id join competitions c on c.id = m.competition_id
     where m.provider = $1 and c.availability = 'available' and not h.is_placeholder and not a.is_placeholder
       and ((m.status = any($2::text[]) and m.kickoff_at > $3) or (m.kickoff_at between $4 and $5))
     order by m.kickoff_at desc limit 20000`,
    [ctx.provider, FINISHED, new Date(ctx.now.getTime() - 400 * 86_400_000), ctx.now, new Date(ctx.now.getTime() + 14 * 86_400_000)],
  );
  return {
    competitions: comps.map((c) => ({ path: competitionPath(c.slug), updatedAt: new Date(c.updated_at) })),
    teams: teams.map((t) => ({ path: teamPath(t), updatedAt: new Date(t.updated_at) })),
    matches: list.map((m) => ({ path: matchPath(m.id, m.home, m.away, new Date(m.kickoff_at)), updatedAt: new Date(m.changed_at) })),
  };
}
