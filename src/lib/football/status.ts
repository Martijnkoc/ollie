/**
 * Provider-neutral match status. Every provider adapter maps its own codes onto these values;
 * the rest of the application only ever sees this list.
 *
 * Rule that must never be broken: a postponed, cancelled or abandoned match is not "finished",
 * and a match without a score never shows 0-0.
 */
export const MATCH_STATUSES = [
  "scheduled",
  "time_tba",
  "delayed",
  "first_half",
  "half_time",
  "second_half",
  "break_before_et",
  "extra_time",
  "extra_time_break",
  "penalties",
  "interrupted",
  "finished",
  "finished_aet",
  "finished_pen",
  "awarded",
  "postponed",
  "suspended",
  "cancelled",
  "abandoned",
  "awaiting_updates",
  "unknown",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** upcoming → live → finished, or "off" when the match did not (fully) take place as planned. */
export type StatusCategory = "upcoming" | "live" | "finished" | "off" | "unknown";

const CATEGORY: Record<MatchStatus, StatusCategory> = {
  scheduled: "upcoming",
  time_tba: "upcoming",
  delayed: "upcoming",
  first_half: "live",
  half_time: "live",
  second_half: "live",
  break_before_et: "live",
  extra_time: "live",
  extra_time_break: "live",
  penalties: "live",
  interrupted: "live",
  finished: "finished",
  finished_aet: "finished",
  finished_pen: "finished",
  awarded: "finished",
  postponed: "off",
  suspended: "off",
  cancelled: "off",
  abandoned: "off",
  awaiting_updates: "unknown",
  unknown: "unknown",
};

const LABEL: Record<MatchStatus, string> = {
  scheduled: "Nog niet begonnen",
  time_tba: "Aanvangstijd nog onbekend",
  delayed: "Vertraagd",
  first_half: "Eerste helft",
  half_time: "Rust",
  second_half: "Tweede helft",
  break_before_et: "Wacht op verlenging",
  extra_time: "Verlenging",
  extra_time_break: "Pauze in verlenging",
  penalties: "Strafschoppen",
  interrupted: "Onderbroken",
  finished: "Afgelopen",
  finished_aet: "Afgelopen na verlenging",
  finished_pen: "Afgelopen na strafschoppen",
  awarded: "Reglementair beslist",
  postponed: "Uitgesteld",
  suspended: "Opgeschort",
  cancelled: "Geannuleerd",
  abandoned: "Gestaakt",
  awaiting_updates: "Wacht op update van de databron",
  unknown: "Status onbekend",
};

/** Compact label for list rows; null means "show the kick-off time instead". */
const SHORT: Record<MatchStatus, string | null> = {
  scheduled: null,
  time_tba: "N.t.b.",
  delayed: "Vertr.",
  first_half: null,
  half_time: "Rust",
  second_half: null,
  break_before_et: "Pauze",
  extra_time: null,
  extra_time_break: "Pauze",
  penalties: "Pen.",
  interrupted: "Onderbr.",
  finished: "Einde",
  finished_aet: "N.v.",
  finished_pen: "N.s.",
  awarded: "Regl.",
  postponed: "Uitgest.",
  suspended: "Opgesch.",
  cancelled: "Geann.",
  abandoned: "Gestaakt",
  awaiting_updates: "?",
  unknown: "?",
};

export function isMatchStatus(value: unknown): value is MatchStatus {
  return typeof value === "string" && (MATCH_STATUSES as readonly string[]).includes(value);
}

export function statusCategory(status: MatchStatus): StatusCategory {
  return CATEGORY[status];
}

export function statusLabel(status: MatchStatus): string {
  return LABEL[status];
}

export const isLive = (status: MatchStatus) => CATEGORY[status] === "live";
export const isFinished = (status: MatchStatus) => CATEGORY[status] === "finished";
export const isUpcoming = (status: MatchStatus) => CATEGORY[status] === "upcoming";

/** Whether a score is meaningful for this status. Postponed or cancelled matches have none. */
export function hasScore(status: MatchStatus) {
  const c = CATEGORY[status];
  return c === "live" || c === "finished" || status === "abandoned" || status === "suspended";
}

/** The clock shown while a match is being played: "37'", "45+2'", "Rust". */
export function liveClock(status: MatchStatus, minute: number | null, extra: number | null): string {
  const short = SHORT[status];
  if (short) return short;
  if (minute === null || minute === undefined) return LABEL[status];
  return extra ? `${minute}+${extra}'` : `${minute}'`;
}

/** What a list row shows in the time column. `kickoff` is the formatted local time. */
export function rowClock(status: MatchStatus, minute: number | null, extra: number | null, kickoff: string): string {
  if (status === "scheduled") return kickoff;
  if (isLive(status)) return liveClock(status, minute, extra);
  return SHORT[status] ?? kickoff;
}
