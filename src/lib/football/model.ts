import type { MatchStatus } from "./status";

/* ------------------------------------------------------------------------------------------
 * Normalised provider output. Adapters translate their own responses into these shapes; the
 * repository stores them. External ids stay strings so any provider fits.
 * ---------------------------------------------------------------------------------------- */

export type CompetitionKind = "league" | "cup";

export interface ProviderSeason {
  externalId: string;
  name: string;
  startYear: number;
  startsOn: string | null;
  endsOn: string | null;
  isCurrent: boolean;
}

export interface ProviderCompetition {
  externalId: string;
  name: string;
  logoUrl: string | null;
  seasons: ProviderSeason[];
}

export interface ProviderTeam {
  externalId: string;
  name: string;
  shortName: string | null;
  code: string | null;
  country: string | null;
  founded: number | null;
  logoUrl: string | null;
  venueName: string | null;
  venueCity: string | null;
  isPlaceholder: boolean;
}

export interface ScorePair {
  home: number | null;
  away: number | null;
}

export const EVENT_TYPES = [
  "goal",
  "own_goal",
  "penalty_goal",
  "missed_penalty",
  "yellow_card",
  "second_yellow",
  "red_card",
  "substitution",
  "var",
  "shootout_goal",
  "shootout_miss",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Events that change the score during play (not the shoot-out). */
export const SCORING_EVENTS: readonly EventType[] = ["goal", "own_goal", "penalty_goal"];

export interface ProviderEvent {
  minute: number | null;
  minuteExtra: number | null;
  /** Which team the event belongs to (for an own goal: the team of the player who scored it). */
  teamExternalId: string | null;
  type: EventType;
  playerName: string | null;
  playerExternalId: string | null;
  /** Assist for goals, the player going off for substitutions. */
  relatedName: string | null;
  relatedExternalId: string | null;
  detail: string | null;
  scoreAfter: string | null;
}

export interface LineupPlayer {
  externalId: string | null;
  name: string;
  number: number | null;
  position: string | null;
  grid: string | null;
}

export interface ProviderLineup {
  teamExternalId: string;
  formation: string | null;
  coachName: string | null;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
}

/**
 * Match statistics we know how to show. A key that is absent, or present with value null,
 * means "not supplied by the data source" — never zero.
 */
export const STAT_KEYS = [
  "possession",
  "shots_total",
  "shots_on_target",
  "shots_off_target",
  "shots_blocked",
  "corners",
  "fouls",
  "offsides",
  "yellow_cards",
  "red_cards",
  "saves",
  "passes_total",
  "passes_accurate",
  "pass_accuracy",
  "expected_goals",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, { label: string; unit?: "%" }> = {
  possession: { label: "Balbezit", unit: "%" },
  shots_total: { label: "Schoten" },
  shots_on_target: { label: "Schoten op doel" },
  shots_off_target: { label: "Schoten naast" },
  shots_blocked: { label: "Geblokte schoten" },
  corners: { label: "Hoekschoppen" },
  fouls: { label: "Overtredingen" },
  offsides: { label: "Buitenspel" },
  yellow_cards: { label: "Gele kaarten" },
  red_cards: { label: "Rode kaarten" },
  saves: { label: "Reddingen" },
  passes_total: { label: "Passes" },
  passes_accurate: { label: "Geslaagde passes" },
  pass_accuracy: { label: "Passnauwkeurigheid", unit: "%" },
  expected_goals: { label: "Verwachte doelpunten (xG)" },
};

export type StatValues = Partial<Record<StatKey, number | null>>;

export interface ProviderTeamStats {
  teamExternalId: string;
  values: StatValues;
}

export interface ProviderMatchDetails {
  /** `undefined` = not requested; `[]` = requested, the source has none (yet). */
  events?: ProviderEvent[];
  lineups?: ProviderLineup[];
  statistics?: ProviderTeamStats[];
}

export interface ProviderMatch {
  externalId: string;
  competitionExternalId: string;
  seasonExternalId: string;
  stageName: string | null;
  roundName: string | null;
  kickoffAt: Date;
  status: MatchStatus;
  providerStatus: string;
  minute: number | null;
  minuteExtra: number | null;
  home: ProviderTeam;
  away: ProviderTeam;
  score: ScorePair;
  halftime: ScorePair;
  extraTime: ScorePair;
  penalties: ScorePair;
  venueName: string | null;
  venueCity: string | null;
  referee: string | null;
  details: ProviderMatchDetails;
}

export interface ProviderStanding {
  groupName: string;
  team: ProviderTeam;
  rank: number;
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

/* ------------------------------------------------------------------------------------------
 * Read models served to pages and the public JSON API. Dates are ISO strings so the same
 * objects can cross the server/client boundary.
 * ---------------------------------------------------------------------------------------- */

export type Freshness = "fresh" | "stale" | "final";

export interface TeamRef {
  id: number;
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string | null;
}

export interface CompetitionRef {
  id: number;
  slug: string;
  name: string;
  country: string;
  countryCode: string | null;
}

export interface MatchSummary {
  id: number;
  path: string;
  competition: CompetitionRef;
  seasonId: number;
  stageName: string | null;
  roundName: string | null;
  kickoffAt: string;
  status: MatchStatus;
  minute: number | null;
  minuteExtra: number | null;
  home: TeamRef;
  away: TeamRef;
  score: ScorePair;
  halftime: ScorePair;
  penalties: ScorePair;
  /** When the provider last confirmed this record. */
  syncedAt: string;
  freshness: Freshness;
}
