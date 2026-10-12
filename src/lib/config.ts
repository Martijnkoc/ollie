export const BRAND = "Ollie";
export const TAGLINE = "Eerst een klik. Dan een date.";

export const TIME_ZONE = "Europe/Amsterdam";

/** Every videodate lasts exactly this long; the room closes itself afterwards. */
export const DATE_MINUTES = 20;
/** The room opens a few minutes early so people can check camera and sound. */
export const LOBBY_MINUTES = 5;
/** A host may propose up to this many moments in one invite. */
export const MAX_PROPOSED_MOMENTS = 3;
/** Moments must be at least this far in the future, and at most this far ahead. */
export const MIN_LEAD_MINUTES = 15;
export const MAX_DAYS_AHEAD = 60;
/** Free trial allowance per host e-mail; mirrors the five dates a Cafe membership will include. */
export const MONTHLY_DATE_LIMIT = Number(process.env.MONTHLY_DATE_LIMIT ?? 5);

export const MIN_AGE = 18;

export const REGIONS = [
  { key: "amsterdam", label: "Amsterdam e.o." },
  { key: "rotterdam", label: "Rotterdam e.o." },
  { key: "den-haag", label: "Den Haag e.o." },
  { key: "utrecht", label: "Utrecht e.o." },
  { key: "eindhoven", label: "Eindhoven e.o." },
  { key: "groningen", label: "Groningen e.o." },
  { key: "elders", label: "Ergens anders in Nederland" },
] as const;
export type RegionKey = (typeof REGIONS)[number]["key"];

/** The community starts in one region; everyone else is welcome on the waiting list. */
export const LAUNCH_REGIONS: string[] = (process.env.LAUNCH_REGIONS ?? "utrecht")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

/** Fixed weekly moments for kennismakingsavonden. weekday: 0 = Sunday. */
export const SLOTS = [
  { key: "di-avond", label: "Dinsdagavond", weekday: 2, time: "20:00" },
  { key: "do-avond", label: "Donderdagavond", weekday: 4, time: "20:00" },
  { key: "zo-avond", label: "Zondagavond", weekday: 0, time: "19:30" },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];

export const GENDERS = [
  { key: "vrouw", label: "Vrouw", plural: "Vrouwen" },
  { key: "man", label: "Man", plural: "Mannen" },
  { key: "non-binair", label: "Non-binair", plural: "Non-binaire mensen" },
] as const;
export type Gender = (typeof GENDERS)[number]["key"];

export const INTENTS = [
  { key: "relatie", label: "Een serieuze relatie" },
  { key: "open", label: "Open voor wat er komt" },
  { key: "ontdekken", label: "Eerst ontdekken wat ik zoek" },
] as const;
export type Intent = (typeof INTENTS)[number]["key"];

export const REPORT_REASONS = [
  { key: "gedrag", label: "Ongepast of seksueel gedrag" },
  { key: "intimidatie", label: "Intimiderend, bedreigend of beledigend" },
  { key: "nep", label: "Nepprofiel, oplichting of geld vragen" },
  { key: "minderjarig", label: "Lijkt minderjarig" },
  { key: "anders", label: "Iets anders" },
] as const;

export const CAFE = {
  open: process.env.CAFE_OPEN === "true",
  priceLabel: "€4,99",
  datesPerMonth: 5,
};

export function label<T extends { key: string; label: string }>(list: readonly T[], key: string | null | undefined) {
  return list.find((item) => item.key === key)?.label ?? key ?? "";
}
