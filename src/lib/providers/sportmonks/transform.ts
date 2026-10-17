import type {
  EventType,
  LineupPlayer,
  ProviderCompetition,
  ProviderEvent,
  ProviderLineup,
  ProviderMatch,
  ProviderSeason,
  ProviderStanding,
  ProviderTeam,
  ProviderTeamStats,
  ScorePair,
  StatKey,
} from "@/lib/football/model";
import type { MatchStatus } from "@/lib/football/status";
import type { SmFixture, SmLeague, SmParticipant, SmSeason, SmStanding, SmType } from "./schema";

/* Sportmonks v3 states. Mapped by developer_name, with the numeric id as a fallback. */
const STATE_BY_NAME: Record<string, MatchStatus> = {
  NS: "scheduled",
  TBA: "time_tba",
  DELAYED: "delayed",
  INPLAY_1ST_HALF: "first_half",
  HT: "half_time",
  INPLAY_2ND_HALF: "second_half",
  BREAK: "break_before_et",
  INPLAY_ET: "extra_time",
  EXTRA_TIME_BREAK: "extra_time_break",
  PEN_BREAK: "penalties",
  INPLAY_PENALTIES: "penalties",
  INTERRUPTED: "interrupted",
  FT: "finished",
  AET: "finished_aet",
  FT_PEN: "finished_pen",
  AWARDED: "awarded",
  WO: "awarded",
  POSTPONED: "postponed",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  ABANDONED: "abandoned",
  AWAITING_UPDATES: "awaiting_updates",
  PENDING: "awaiting_updates",
};
const STATE_BY_ID: Record<number, string> = {
  1: "NS",
  2: "INPLAY_1ST_HALF",
  3: "HT",
  4: "BREAK",
  5: "FT",
  6: "INPLAY_ET",
  7: "AET",
  8: "FT_PEN",
  9: "INPLAY_PENALTIES",
  10: "POSTPONED",
  11: "SUSPENDED",
  12: "CANCELLED",
  13: "TBA",
  14: "WO",
  15: "ABANDONED",
  16: "DELAYED",
  17: "AWARDED",
  18: "INTERRUPTED",
  19: "AWAITING_UPDATES",
  20: "DELETED",
  21: "EXTRA_TIME_BREAK",
  22: "INPLAY_2ND_HALF",
  25: "PEN_BREAK",
  26: "PENDING",
};

/** "DELETED" fixtures are withdrawn by the source and must disappear rather than show a status. */
export const DELETED_STATE = "DELETED";

export function mapState(fixture: Pick<SmFixture, "state" | "state_id">): { status: MatchStatus; code: string } {
  const code = fixture.state?.developer_name ?? fixture.state?.state ?? (fixture.state_id ? STATE_BY_ID[fixture.state_id] : undefined) ?? "UNKNOWN";
  return { status: STATE_BY_NAME[code] ?? "unknown", code };
}

/* Event types: developer_name first, numeric id as a fallback. */
const EVENT_BY_NAME: Record<string, EventType> = {
  GOAL: "goal",
  OWNGOAL: "own_goal",
  PENALTY: "penalty_goal",
  MISSED_PENALTY: "missed_penalty",
  YELLOWCARD: "yellow_card",
  YELLOWREDCARD: "second_yellow",
  REDCARD: "red_card",
  SUBSTITUTION: "substitution",
  VAR: "var",
  VAR_CARD: "var",
  PENALTY_SHOOTOUT_GOAL: "shootout_goal",
  PENALTY_SHOOTOUT_MISS: "shootout_miss",
};
const EVENT_BY_ID: Record<number, string> = {
  10: "VAR",
  14: "GOAL",
  15: "OWNGOAL",
  16: "PENALTY",
  17: "MISSED_PENALTY",
  18: "SUBSTITUTION",
  19: "YELLOWCARD",
  20: "REDCARD",
  21: "YELLOWREDCARD",
  22: "PENALTY_SHOOTOUT_MISS",
  23: "PENALTY_SHOOTOUT_GOAL",
};

const STAT_BY_NAME: Record<string, StatKey> = {
  BALL_POSSESSION: "possession",
  SHOTS_TOTAL: "shots_total",
  SHOTS_ON_TARGET: "shots_on_target",
  SHOTS_OFF_TARGET: "shots_off_target",
  SHOTS_BLOCKED: "shots_blocked",
  CORNERS: "corners",
  FOULS: "fouls",
  OFFSIDES: "offsides",
  YELLOWCARDS: "yellow_cards",
  REDCARDS: "red_cards",
  SAVES: "saves",
  PASSES: "passes_total",
  SUCCESSFUL_PASSES: "passes_accurate",
  SUCCESSFUL_PASSES_PERCENTAGE: "pass_accuracy",
  EXPECTED_GOALS: "expected_goals",
};
const STAT_BY_ID: Record<number, string> = {
  34: "CORNERS",
  41: "SHOTS_OFF_TARGET",
  42: "SHOTS_TOTAL",
  45: "BALL_POSSESSION",
  51: "OFFSIDES",
  56: "FOULS",
  57: "SAVES",
  58: "SHOTS_BLOCKED",
  80: "PASSES",
  81: "SUCCESSFUL_PASSES",
  82: "SUCCESSFUL_PASSES_PERCENTAGE",
  83: "REDCARDS",
  84: "YELLOWCARDS",
  86: "SHOTS_ON_TARGET",
  5304: "EXPECTED_GOALS",
};

const POSITION_BY_ID: Record<number, string> = { 24: "K", 25: "V", 26: "M", 27: "A" };

const typeName = (type: SmType | null | undefined, id: number | null | undefined, byId: Record<number, string>) =>
  type?.developer_name ?? (id !== null && id !== undefined ? byId[id] : undefined);

export function toTeam(p: SmParticipant): ProviderTeam {
  return {
    externalId: p.id,
    name: p.name.trim(),
    shortName: null,
    code: p.short_code ?? null,
    country: p.country?.name ?? null,
    founded: p.founded ?? null,
    logoUrl: p.image_path ?? null,
    venueName: p.venue?.name ?? null,
    venueCity: p.venue?.city_name ?? null,
    isPlaceholder: Boolean(p.placeholder),
  };
}

export function toSeason(s: SmSeason): ProviderSeason {
  const year = Number(/^(\d{4})/.exec(s.name)?.[1] ?? s.starting_at?.slice(0, 4) ?? NaN);
  return {
    externalId: s.id,
    name: s.name,
    startYear: Number.isFinite(year) ? year : new Date().getUTCFullYear(),
    startsOn: s.starting_at?.slice(0, 10) ?? null,
    endsOn: s.ending_at?.slice(0, 10) ?? null,
    isCurrent: Boolean(s.is_current),
  };
}

/** The current season first, then the previous ones, newest first. */
export function toCompetition(league: SmLeague): ProviderCompetition {
  const all = new Map<string, ProviderSeason>();
  for (const s of league.seasons ?? []) all.set(s.id, toSeason(s));
  const current = league.currentseason ?? league.currentSeason;
  if (current) all.set(current.id, { ...toSeason(current), isCurrent: true });
  const seasons = [...all.values()].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.startYear - a.startYear);
  return { externalId: league.id, name: league.name, logoUrl: league.image_path ?? null, seasons };
}

function sides(fixture: SmFixture) {
  const participants = fixture.participants ?? [];
  const home = participants.find((p) => p.meta?.location === "home") ?? participants[0];
  const away = participants.find((p) => p.meta?.location === "away") ?? participants.find((p) => p !== home);
  return { home, away };
}

type ScoreKind = "current" | "halftime" | "extraTime" | "penalties";

function scoreKind(description: string | null): ScoreKind | null {
  const d = (description ?? "").toUpperCase();
  if (d === "CURRENT") return "current";
  if (d === "1ST_HALF") return "halftime";
  if (d.includes("PEN")) return "penalties";
  if (d === "ET" || d.startsWith("EXTRA") || d === "ET_ONLY") return "extraTime";
  return null;
}

function scores(fixture: SmFixture, homeId: string | undefined): Record<ScoreKind, ScorePair> {
  const out: Record<ScoreKind, ScorePair> = {
    current: { home: null, away: null },
    halftime: { home: null, away: null },
    extraTime: { home: null, away: null },
    penalties: { home: null, away: null },
  };
  for (const s of fixture.scores ?? []) {
    const kind = scoreKind(s.description);
    if (!kind) continue;
    const side = s.score.participant ?? (s.participant_id && homeId ? (s.participant_id === homeId ? "home" : "away") : null);
    if (!side) continue;
    out[kind][side] = s.score.goals;
  }
  return out;
}

/** Minute shown while playing, from the ticking period: "45+2" becomes minute 45, extra 2. */
export function liveMinute(fixture: SmFixture): { minute: number | null; extra: number | null } {
  const periods = fixture.periods ?? [];
  const period = periods.find((p) => p.ticking) ?? [...periods].reverse().find((p) => p.started && !p.ended);
  if (!period || period.minutes === null || period.minutes === undefined) return { minute: null, extra: null };
  const regularEnd = (period.counts_from ?? 0) + (period.period_length ?? 0);
  if (period.period_length && period.minutes > regularEnd) return { minute: regularEnd, extra: period.minutes - regularEnd };
  return { minute: period.minutes, extra: null };
}

function toEvents(fixture: SmFixture): ProviderEvent[] {
  const list = [...(fixture.events ?? [])].sort(
    (a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.extra_minute ?? 0) - (b.extra_minute ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const out: ProviderEvent[] = [];
  for (const e of list) {
    const name = typeName(e.type, e.type_id, EVENT_BY_ID);
    let type: EventType = (name && EVENT_BY_NAME[name]) || "other";
    let detail = e.addition ?? e.info ?? null;
    // An event withdrawn after a VAR review no longer counts.
    if (e.rescinded && (type === "goal" || type === "own_goal" || type === "penalty_goal" || type === "red_card")) {
      detail = type === "red_card" ? "Rode kaart ingetrokken na VAR" : "Doelpunt afgekeurd na VAR";
      type = "var";
    }
    if (type === "other") continue;
    out.push({
      minute: e.minute ?? null,
      minuteExtra: e.extra_minute ?? null,
      teamExternalId: e.participant_id ?? null,
      type,
      // Sportmonks: for substitutions `player` comes on and `related_player` goes off.
      playerName: e.player_name ?? null,
      playerExternalId: e.player_id ?? null,
      relatedName: e.related_player_name ?? null,
      relatedExternalId: e.related_player_id ?? null,
      detail,
      scoreAfter: e.result ?? null,
    });
  }
  return out;
}

function toLineups(fixture: SmFixture, homeId: string | undefined, awayId: string | undefined): ProviderLineup[] {
  const entries = fixture.lineups ?? [];
  if (entries.length === 0) return [];
  const out: ProviderLineup[] = [];
  for (const teamId of [homeId, awayId]) {
    if (!teamId) continue;
    const mine = entries.filter((l) => l.team_id === teamId);
    if (mine.length === 0) continue;
    const player = (l: (typeof mine)[number]): LineupPlayer => ({
      externalId: l.player_id ?? null,
      name: l.player_name ?? "Onbekende speler",
      number: l.jersey_number ?? null,
      position: l.position_id ? (POSITION_BY_ID[l.position_id] ?? null) : null,
      grid: l.formation_field ?? null,
    });
    const order = (a: (typeof mine)[number], b: (typeof mine)[number]) => (a.formation_position ?? 99) - (b.formation_position ?? 99);
    out.push({
      teamExternalId: teamId,
      formation: fixture.formations?.find((f) => f.participant_id === teamId)?.formation ?? null,
      coachName: null,
      // type 11 = starting line-up, 12 = bench.
      starters: mine.filter((l) => l.type_id === 11).sort(order).map(player),
      substitutes: mine.filter((l) => l.type_id === 12).map(player),
    });
  }
  return out;
}

function statValue(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function toStatistics(fixture: SmFixture, homeId: string | undefined, awayId: string | undefined): ProviderTeamStats[] {
  const entries = fixture.statistics ?? [];
  if (entries.length === 0) return [];
  const byTeam = new Map<string, ProviderTeamStats>();
  for (const s of entries) {
    const teamId = s.participant_id ?? (s.location === "home" ? homeId : s.location === "away" ? awayId : undefined);
    if (!teamId) continue;
    const name = typeName(s.type, s.type_id, STAT_BY_ID);
    const key = name ? STAT_BY_NAME[name] : undefined;
    if (!key) continue;
    const team = byTeam.get(teamId) ?? { teamExternalId: teamId, values: {} };
    team.values[key] = statValue(s.data?.value);
    byTeam.set(teamId, team);
  }
  return [...byTeam.values()];
}

export interface FixtureIncludes {
  details: boolean;
}

export function toMatch(fixture: SmFixture, includes: FixtureIncludes): ProviderMatch | null {
  const { home, away } = sides(fixture);
  if (!home || !away) return null;
  const kickoff = fixture.starting_at_timestamp
    ? new Date(fixture.starting_at_timestamp * 1000)
    : fixture.starting_at
      ? new Date(`${fixture.starting_at.replace(" ", "T")}Z`)
      : null;
  if (!kickoff || Number.isNaN(kickoff.getTime())) return null;

  const { status, code } = mapState(fixture);
  const s = scores(fixture, home.id);
  const clock = status === "first_half" || status === "second_half" || status === "extra_time" ? liveMinute(fixture) : { minute: null, extra: null };

  return {
    externalId: fixture.id,
    competitionExternalId: fixture.league_id,
    seasonExternalId: fixture.season_id,
    stageName: fixture.stage?.name ?? null,
    roundName: fixture.round?.name ?? null,
    kickoffAt: kickoff,
    status,
    providerStatus: code,
    minute: clock.minute,
    minuteExtra: clock.extra,
    home: toTeam(home),
    away: toTeam(away),
    score: s.current,
    halftime: s.halftime,
    extraTime: s.extraTime,
    penalties: s.penalties,
    venueName: fixture.venue?.name ?? null,
    venueCity: fixture.venue?.city_name ?? null,
    referee: null,
    details: includes.details
      ? {
          events: toEvents(fixture),
          lineups: toLineups(fixture, home.id, away.id),
          statistics: toStatistics(fixture, home.id, away.id),
        }
      : {},
  };
}

const DETAIL_FIELDS: Record<string, { names: string[]; ids: number[] }> = {
  played: { names: ["OVERALL_MATCHES"], ids: [129] },
  won: { names: ["OVERALL_WINS"], ids: [130] },
  drawn: { names: ["OVERALL_DRAWS"], ids: [131] },
  lost: { names: ["OVERALL_LOST"], ids: [132] },
  goalsFor: { names: ["OVERALL_SCORED", "OVERALL_GOALS_SCORED"], ids: [133] },
  goalsAgainst: { names: ["OVERALL_CONCEDED", "OVERALL_GOALS_CONCEDED"], ids: [134] },
  goalDiff: { names: ["OVERALL_GOAL_DIFFERENCE", "GOAL_DIFFERENCE"], ids: [179] },
};

const FORM_LETTER: Record<string, string> = { W: "W", D: "G", L: "V" };

export function toStanding(row: SmStanding): ProviderStanding | null {
  if (!row.participant) return null;
  const detail = (field: keyof typeof DETAIL_FIELDS) => {
    const spec = DETAIL_FIELDS[field];
    const hit = (row.details ?? []).find((d) => (d.type?.developer_name && spec.names.includes(d.type.developer_name)) || spec.ids.includes(d.type_id));
    return hit?.value ?? null;
  };
  const goalsFor = detail("goalsFor");
  const goalsAgainst = detail("goalsAgainst");
  const form = (row.form ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(-5)
    .map((f) => FORM_LETTER[f.form.toUpperCase()] ?? "")
    .join("");
  return {
    groupName: row.group?.name ?? "",
    team: toTeam(row.participant),
    rank: row.position,
    points: row.points ?? null,
    played: detail("played"),
    won: detail("won"),
    drawn: detail("drawn"),
    lost: detail("lost"),
    goalsFor,
    goalsAgainst,
    goalDiff: detail("goalDiff") ?? (goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null),
    form: form || null,
    description: row.rule?.type?.name ?? null,
  };
}
