export const BRAND = "Cafe";
export const TAGLINE = "Eerst een klik. Dan een date.";

export const TIME_ZONE = "Europe/Amsterdam";

/** Every videodate lasts exactly this long, counted from the moment both people are present. */
export const DATE_MINUTES = 20;
/** The lobby opens this long before the agreed time, for a camera and microphone check. */
export const LOBBY_MINUTES = 5;
/** If the two of you are not both present this long after the agreed time, it counts as a no-show. */
export const JOIN_WINDOW_MINUTES = 15;
/** A participant counts as present while heartbeats keep arriving within this many seconds. */
export const PRESENCE_TTL_SECONDS = 20;
/** Warn this long before the end. */
export const WARNING_MINUTES = 2;
/** Without an answer from the other person we stop waiting for feedback after this many days. */
export const FEEDBACK_DAYS = 7;

export const MAX_PROPOSED_MOMENTS = 3;
export const MIN_LEAD_MINUTES = 15;
export const MAX_DAYS_AHEAD = 60;
export const MIN_AGE = 18;

/** Membership: price and quota are configuration, not a validated commercial model. */
export const MEMBERSHIP = {
  priceLabel: process.env.MEMBERSHIP_PRICE_LABEL ?? "€4,99",
  period: "maand",
  datesPerPeriod: Number(process.env.MEMBERSHIP_DATES_PER_PERIOD ?? 5),
  /** Shown next to the price until tax treatment has been confirmed for launch. */
  priceNote: process.env.MEMBERSHIP_PRICE_NOTE ?? "Testprijs. Of de prijs inclusief btw is, leggen we vast vóór de lancering.",
};

/** Hours a membership keeps access after its paid period ends, to absorb a late renewal webhook. */
export const BILLING_GRACE_HOURS = 48;

export const REGIONS = [
  { key: "noord", label: "Noord-Nederland" },
  { key: "oost", label: "Oost-Nederland" },
  { key: "randstad-noord", label: "Amsterdam e.o." },
  { key: "randstad-zuid", label: "Rotterdam, Den Haag e.o." },
  { key: "utrecht", label: "Utrecht e.o." },
  { key: "zuid", label: "Zuid-Nederland" },
  { key: "belgie", label: "België" },
  { key: "elders", label: "Elders" },
] as const;

export const INTENTS = [
  { key: "relatie", label: "Een serieuze relatie" },
  { key: "open", label: "Open voor wat er komt" },
  { key: "ontdekken", label: "Eerst ontdekken wat ik zoek" },
] as const;

export const INTERESTS = [
  "Wandelen",
  "Koken",
  "Muziek",
  "Film & series",
  "Lezen",
  "Sport",
  "Reizen",
  "Kunst & cultuur",
  "Natuur",
  "Spelletjes",
  "Uitgaan",
  "Dieren",
] as const;

/** Where people matched. Plain text only: these services are not partners of Cafe. */
export const MATCH_ORIGINS = ["Tinder", "Bumble", "Hinge", "Happn", "Breeze", "Ergens anders"] as const;

export const REPORT_REASONS = [
  { key: "gedrag", label: "Ongepast of seksueel gedrag" },
  { key: "intimidatie", label: "Intimiderend, bedreigend of beledigend" },
  { key: "nep", label: "Nepprofiel, oplichting of geld vragen" },
  { key: "minderjarig", label: "Lijkt minderjarig" },
  { key: "spam", label: "Spam of reclame" },
  { key: "anders", label: "Iets anders" },
] as const;

export const CONTACT_FIELDS = [
  { key: "phone", label: "Telefoonnummer", placeholder: "06 12 34 56 78" },
  { key: "email", label: "E-mailadres", placeholder: "naam@voorbeeld.nl" },
  { key: "social", label: "Social media", placeholder: "@gebruikersnaam" },
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number]["key"];

/** Rate limits: [max events, window in seconds]. */
export const LIMITS = {
  otpPerEmail: [5, 15 * 60],
  otpPerIp: [30, 60 * 60],
  channelMessages: [20, 60],
  threadMessages: [40, 60],
  contactRequests: [10, 24 * 3600],
  invites: [10, 24 * 3600],
  proposals: [10, 24 * 3600],
  reports: [10, 24 * 3600],
} as const satisfies Record<string, readonly [number, number]>;

export function label<T extends { key: string; label: string }>(list: readonly T[], key: string | null | undefined) {
  return list.find((item) => item.key === key)?.label ?? key ?? "";
}
