export const BRAND = "Sell Yourself";
export const TAGLINE = "Same energy. Different talents.";
export const HEADLINE = "Je hebt iets te bieden. Laat het zien.";

export const TIME_ZONE = "Europe/Amsterdam";
export const LOCALE = "nl-NL";
export const CURRENCY = "eur";

export const CATEGORIES = [
  {
    key: "creators",
    label: "Creators",
    blurb: "Content, UGC, social media en samenwerkingen.",
    examples: ["UGC-video's", "Instagram-content", "TikTok-campagnes"],
  },
  {
    key: "digitaal",
    label: "Digitaal",
    blurb: "Websites, apps, design, marketing en data.",
    examples: ["Webshop bouwen", "Logo-ontwerp", "SEO-advies"],
  },
  {
    key: "creatief",
    label: "Creatief",
    blurb: "Fotografie, video, illustratie en kunst.",
    examples: ["Portretshoot", "Bedrijfsvideo", "Illustratie op maat"],
  },
  {
    key: "sport",
    label: "Sport & Gezondheid",
    blurb: "Training, voeding, yoga en herstel.",
    examples: ["Personal training", "Voedingsschema", "Yogales aan huis"],
  },
  {
    key: "huis",
    label: "Huis & Klus",
    blurb: "Schilderen, installeren, timmeren en tuin.",
    examples: ["Woonkamer schilderen", "Laadpaal installeren", "Tuin aanleggen"],
  },
  {
    key: "muziek",
    label: "Muziek & Audio",
    blurb: "Muzikanten, dj's, productie en les.",
    examples: ["Dj voor een feest", "Mixen en masteren", "Gitaarles"],
  },
  {
    key: "coaching",
    label: "Coaching",
    blurb: "Loopbaan, business, studie en persoonlijke groei.",
    examples: ["Loopbaancoaching", "Bijles wiskunde", "Pitchtraining"],
  },
  {
    key: "overig",
    label: "Overig",
    blurb: "Talent dat nergens anders in past.",
    examples: ["Kalligrafie", "Vertaling", "Dierenoppas"],
  },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as CategoryKey[];

export const REGIONS = [
  { key: "groningen", label: "Groningen" },
  { key: "friesland", label: "Friesland" },
  { key: "drenthe", label: "Drenthe" },
  { key: "overijssel", label: "Overijssel" },
  { key: "flevoland", label: "Flevoland" },
  { key: "gelderland", label: "Gelderland" },
  { key: "utrecht", label: "Utrecht" },
  { key: "noord-holland", label: "Noord-Holland" },
  { key: "zuid-holland", label: "Zuid-Holland" },
  { key: "zeeland", label: "Zeeland" },
  { key: "noord-brabant", label: "Noord-Brabant" },
  { key: "limburg", label: "Limburg" },
] as const;

export const AVAILABILITY = [
  { key: "available", label: "Beschikbaar voor opdrachten" },
  { key: "limited", label: "Beperkt beschikbaar" },
  { key: "unavailable", label: "Nu niet beschikbaar" },
] as const;

export const LOCATION_MODES = [
  { key: "remote", label: "Op afstand" },
  { key: "on_site", label: "Op locatie" },
  { key: "both", label: "Op afstand of op locatie" },
] as const;

export const SELLER_TYPES = [
  { key: "private", label: "Particulier" },
  { key: "business", label: "Zakelijk (KvK)" },
] as const;

/**
 * Platform fee in basis points of the agreed price, paid out of the seller's amount.
 * Buyers pay exactly the price they see; the split is shown to both sides before anything is agreed.
 * The value is configuration, not a validated commercial model.
 */
export const PLATFORM_FEE_BPS = Math.round(Number(process.env.PLATFORM_FEE_PERCENT ?? 10) * 100);
export const MIN_PRICE_CENTS = 500;
export const MAX_PRICE_CENTS = 2_500_000;
export const MAX_DELIVERY_DAYS = 365;

/** After delivery the buyer has this many days to accept or open a complaint; then the order completes by itself. */
export const AUTO_COMPLETE_DAYS = 7;
/** A buyer may cancel and get a refund once delivery is this many days overdue. */
export const OVERDUE_GRACE_DAYS = 2;
export const QUOTE_VALID_DAYS = 14;
/** Version of the order terms the buyer confirms; stored with every order. */
export const TERMS_VERSION = "2026-10-concept";

export const MAX_SKILLS = 12;
export const MAX_INCLUDES = 10;
export const MAX_EXTRAS = 5;
export const MAX_SERVICES = 20;
export const MAX_PORTFOLIO = 60;

export const UPLOAD_LIMITS = {
  avatar: { kinds: ["image"], maxBytes: 5 * 1024 * 1024 },
  cover: { kinds: ["image"], maxBytes: 8 * 1024 * 1024 },
  service: { kinds: ["image"], maxBytes: 8 * 1024 * 1024 },
  portfolio: { kinds: ["image", "video"], maxBytes: 60 * 1024 * 1024 },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_LIMITS;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const REPORT_REASONS = [
  { key: "oplichting", label: "Oplichting, fraude of betalen buiten het platform om" },
  { key: "misleidend", label: "Misleidend aanbod of nepprofiel" },
  { key: "ongepast", label: "Seksueel getinte of ongepaste inhoud" },
  { key: "intimidatie", label: "Intimiderend, bedreigend of beledigend" },
  { key: "rechten", label: "Inbreuk op auteursrecht of andermans werk" },
  { key: "verboden", label: "Verboden of illegaal aanbod" },
  { key: "spam", label: "Spam" },
  { key: "anders", label: "Iets anders" },
] as const;

/** Rate limits: [max events, window in seconds]. */
export const LIMITS = {
  otpPerEmail: [5, 15 * 60],
  otpPerIp: [30, 60 * 60],
  threadMessages: [40, 60],
  newThreads: [20, 24 * 3600],
  orders: [20, 24 * 3600],
  quotes: [60, 24 * 3600],
  reports: [10, 24 * 3600],
  uploads: [80, 3600],
  follows: [200, 3600],
} as const satisfies Record<string, readonly [number, number]>;

export function label<T extends { key: string; label: string }>(list: readonly T[], key: string | null | undefined) {
  return list.find((item) => item.key === key)?.label ?? key ?? "";
}

export function categoryLabel(key: string | null | undefined) {
  return label(CATEGORIES, key);
}
