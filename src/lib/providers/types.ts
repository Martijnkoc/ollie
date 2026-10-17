import type { CatalogCompetition } from "@/lib/football/catalog";
import type { ProviderCompetition, ProviderMatch, ProviderStanding, ProviderTeam } from "@/lib/football/model";
import type { RequestRecord } from "./http";

export type CompetitionLookup = { status: "available"; competition: ProviderCompetition } | { status: "unavailable"; note: string };

/**
 * What the synchronisation needs from a football data source. Implementations translate their
 * own API into the normalised model; nothing outside `src/lib/providers` knows provider formats.
 */
export interface FootballProvider {
  readonly id: "sportmonks" | "demo";
  readonly label: string;
  readonly isDemo: boolean;
  /** Whether the subscription includes this competition, and its seasons (current first). */
  getCompetition(entry: CatalogCompetition): Promise<CompetitionLookup>;
  getSeasonTeams(seasonExternalId: string): Promise<ProviderTeam[]>;
  /** Fixtures with core fields (teams, status, score) for whole days `from`..`to` (UTC dates, inclusive). */
  getMatchesBetween(competitionExternalIds: string[], from: string, to: string): Promise<ProviderMatch[]>;
  /** Fixtures with events, line-ups and statistics. */
  getMatchesByIds(externalIds: string[]): Promise<ProviderMatch[]>;
  /** Official standings; `null` when the source has none for this season (e.g. knock-out only). */
  getStandings(seasonExternalId: string): Promise<ProviderStanding[] | null>;
}

export interface ProviderContext {
  onRequest?: (record: RequestRecord) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}
