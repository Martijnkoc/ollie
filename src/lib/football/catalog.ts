import type { CompetitionKind } from "./model";

/**
 * The competitions Voetbalradar wants to cover. This is only an intention: whether a competition
 * is actually available is asked from the data source (see the `competitions` job) and stored as
 * `availability`. A competition is never shown as supported on this list alone.
 *
 * Provider ids come from the providers' public documentation. The availability job checks that
 * the name the provider returns matches `expect`; a mismatch blocks synchronisation instead of
 * filling the page with the wrong league.
 */
export interface CatalogCompetition {
  slug: string;
  name: string;
  country: string;
  countryCode: string | null;
  kind: CompetitionKind;
  sortOrder: number;
  expect: RegExp;
  providers: { sportmonks: number };
}

export const CATALOG: readonly CatalogCompetition[] = [
  {
    slug: "eredivisie",
    name: "Eredivisie",
    country: "Nederland",
    countryCode: "NL",
    kind: "league",
    sortOrder: 10,
    expect: /eredivisie/i,
    providers: { sportmonks: 72 },
  },
  {
    slug: "champions-league",
    name: "UEFA Champions League",
    country: "Europa",
    countryCode: null,
    kind: "cup",
    sortOrder: 20,
    expect: /champions league/i,
    providers: { sportmonks: 2 },
  },
  {
    slug: "europa-league",
    name: "UEFA Europa League",
    country: "Europa",
    countryCode: null,
    kind: "cup",
    sortOrder: 30,
    expect: /^(uefa )?europa league/i,
    providers: { sportmonks: 5 },
  },
  {
    slug: "premier-league",
    name: "Premier League",
    country: "Engeland",
    countryCode: "GB-ENG",
    kind: "league",
    sortOrder: 40,
    expect: /^premier league/i,
    providers: { sportmonks: 8 },
  },
  {
    slug: "la-liga",
    name: "La Liga",
    country: "Spanje",
    countryCode: "ES",
    kind: "league",
    sortOrder: 50,
    expect: /la ?liga/i,
    providers: { sportmonks: 564 },
  },
  {
    slug: "serie-a",
    name: "Serie A",
    country: "Italië",
    countryCode: "IT",
    kind: "league",
    sortOrder: 60,
    expect: /serie a/i,
    providers: { sportmonks: 384 },
  },
  {
    slug: "bundesliga",
    name: "Bundesliga",
    country: "Duitsland",
    countryCode: "DE",
    kind: "league",
    sortOrder: 70,
    expect: /^bundesliga/i,
    providers: { sportmonks: 82 },
  },
  {
    slug: "ligue-1",
    name: "Ligue 1",
    country: "Frankrijk",
    countryCode: "FR",
    kind: "league",
    sortOrder: 80,
    expect: /ligue 1/i,
    providers: { sportmonks: 301 },
  },
  // Included in Sportmonks' permanent free plan: real current-season data for testing the chain.
  {
    slug: "superliga",
    name: "Superliga",
    country: "Denemarken",
    countryCode: "DK",
    kind: "league",
    sortOrder: 90,
    expect: /superliga/i,
    providers: { sportmonks: 271 },
  },
  {
    slug: "scottish-premiership",
    name: "Premiership",
    country: "Schotland",
    countryCode: "GB-SCT",
    kind: "league",
    sortOrder: 100,
    expect: /premiership/i,
    providers: { sportmonks: 501 },
  },
];

export function catalogEntry(slug: string) {
  return CATALOG.find((c) => c.slug === slug);
}

/** The catalogue narrowed to the COMPETITIONS setting (empty = everything). */
export function selectedCatalog(slugs: string[]) {
  if (slugs.length === 0) return [...CATALOG];
  return CATALOG.filter((c) => slugs.includes(c.slug));
}
