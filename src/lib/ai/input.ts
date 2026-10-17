import { STAT_LABELS, type MatchSummary } from "@/lib/football/model";
import type { MatchDetail } from "@/lib/football/queries";
import { statusLabel } from "@/lib/football/status";
import type { AnalysisKind } from "./schema";

/**
 * The only facts an analysis may use: a compact, validated JSON built from our own database.
 * Absent data is listed explicitly under `missing` so the model can say what it does not know.
 */
export interface AnalysisInput {
  kind: AnalysisKind;
  data_source: string;
  match: {
    competition: string;
    season: string;
    stage: string | null;
    round: string | null;
    kickoff_utc: string;
    venue: string | null;
    status: string;
    home: string;
    away: string;
    score: { home: number | null; away: number | null } | null;
    halftime: { home: number | null; away: number | null } | null;
  };
  standings: {
    team: string;
    group: string;
    rank: number;
    points: number | null;
    played: number | null;
    goal_diff: number | null;
    form: string | null;
  }[];
  recent_form: { home: RecentMatch[]; away: RecentMatch[] };
  head_to_head: RecentMatch[];
  events: { minute: string; team: string | null; type: string; player: string | null; related: string | null }[] | null;
  statistics: { name: string; home: number | null; away: number | null }[] | null;
  lineups: { home_formation: string | null; away_formation: string | null } | null;
  missing: string[];
}

interface RecentMatch {
  date: string;
  competition: string;
  home: string;
  away: string;
  score: string;
}

const recent = (m: MatchSummary): RecentMatch => ({
  date: m.kickoffAt.slice(0, 10),
  competition: m.competition.name,
  home: m.home.name,
  away: m.away.name,
  score: `${m.score.home ?? "?"}-${m.score.away ?? "?"}`,
});

const EVENT_NAMES: Record<string, string> = {
  goal: "doelpunt",
  own_goal: "eigen doelpunt",
  penalty_goal: "doelpunt uit strafschop",
  missed_penalty: "gemiste strafschop",
  yellow_card: "gele kaart",
  second_yellow: "tweede gele kaart",
  red_card: "rode kaart",
  substitution: "wissel (speler in, speler uit)",
  var: "VAR-besluit",
};

export function buildAnalysisInput(detail: MatchDetail, kind: AnalysisKind, dataSource: string): AnalysisInput {
  const m = detail.match;
  const missing: string[] = [];
  const played = kind === "review";
  const teamName = (side: "home" | "away" | null) => (side === "home" ? m.home.name : side === "away" ? m.away.name : null);

  const standings = detail.standings
    .filter((r) => r.team.id === m.home.id || r.team.id === m.away.id)
    .map((r) => ({
      team: r.team.name,
      group: r.group,
      rank: r.rank,
      points: r.points,
      played: r.played,
      goal_diff: r.goalDiff,
      form: r.form,
    }));
  if (standings.length === 0) missing.push("competitiestand");
  if (detail.homeRecent.length === 0 && detail.awayRecent.length === 0) missing.push("recente resultaten");
  if (detail.headToHead.length === 0) missing.push("onderlinge resultaten in de opgeslagen seizoenen");

  let events: AnalysisInput["events"] = null;
  let statistics: AnalysisInput["statistics"] = null;
  if (played) {
    events = detail.events
      .filter((e) => e.type in EVENT_NAMES)
      .map((e) => ({
        minute: e.minute === null ? "?" : e.minuteExtra ? `${e.minute}+${e.minuteExtra}` : String(e.minute),
        team: teamName(e.side),
        type: EVENT_NAMES[e.type],
        player: e.playerName,
        related: e.relatedName,
      }));
    if (events.length === 0) missing.push("wedstrijdgebeurtenissen");
    statistics = detail.statistics?.map((s) => ({ name: STAT_LABELS[s.key].label, home: s.home, away: s.away })) ?? null;
    if (!statistics) missing.push("wedstrijdstatistieken");
  }
  const lineups =
    detail.lineups.home || detail.lineups.away
      ? { home_formation: detail.lineups.home?.formation ?? null, away_formation: detail.lineups.away?.formation ?? null }
      : null;
  if (!lineups) missing.push("opstellingen");

  return {
    kind,
    data_source: dataSource,
    match: {
      competition: m.competition.name,
      season: detail.seasonName,
      stage: m.stageName,
      round: m.roundName,
      kickoff_utc: m.kickoffAt,
      venue: detail.venueName,
      status: statusLabel(m.status),
      home: m.home.name,
      away: m.away.name,
      score: played ? m.score : null,
      halftime: played ? m.halftime : null,
    },
    standings,
    recent_form: { home: detail.homeRecent.map(recent), away: detail.awayRecent.map(recent) },
    head_to_head: detail.headToHead.map(recent),
    events,
    statistics,
    lineups,
    missing,
  };
}
