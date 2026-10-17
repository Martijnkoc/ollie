import type { CatalogCompetition } from "@/lib/football/catalog";
import type { ProviderMatch, ProviderStanding, ProviderTeam } from "@/lib/football/model";
import { ProviderError } from "@/lib/providers/http";
import type { CompetitionLookup, FootballProvider } from "@/lib/providers/types";

/** A provider whose answers a test controls completely. TEST ONLY. */
export function team(id: string, name: string): ProviderTeam {
  return {
    externalId: id,
    name,
    shortName: null,
    code: null,
    country: null,
    founded: null,
    logoUrl: null,
    venueName: null,
    venueCity: null,
    isPlaceholder: false,
  };
}

export function match(id: string, over: Partial<ProviderMatch> = {}): ProviderMatch {
  return {
    externalId: id,
    competitionExternalId: "L1",
    seasonExternalId: "S1",
    stageName: "Regular Season",
    roundName: "1",
    kickoffAt: new Date("2026-10-17T14:30:00Z"),
    status: "scheduled",
    providerStatus: "NS",
    minute: null,
    minuteExtra: null,
    home: team("T1", "Thuisclub"),
    away: team("T2", "Uitclub"),
    score: { home: null, away: null },
    halftime: { home: null, away: null },
    extraTime: { home: null, away: null },
    penalties: { home: null, away: null },
    venueName: null,
    venueCity: null,
    referee: null,
    details: {},
    ...over,
  };
}

export class ScriptedProvider implements FootballProvider {
  readonly id = "sportmonks" as const;
  readonly label = "Scripted";
  readonly isDemo = false;
  name = "Eredivisie";
  matches: ProviderMatch[] = [];
  standings: ProviderStanding[] | null = null;
  calls: string[] = [];
  failWith: ProviderError | null = null;

  async getCompetition(entry: CatalogCompetition): Promise<CompetitionLookup> {
    this.calls.push(`competition:${entry.slug}`);
    if (this.failWith) throw this.failWith;
    if (entry.slug !== "eredivisie") return { status: "unavailable", note: "Niet in abonnement" };
    return {
      status: "available",
      competition: {
        externalId: "L1",
        name: this.name,
        logoUrl: null,
        seasons: [{ externalId: "S1", name: "2026/2027", startYear: 2026, startsOn: "2026-08-01", endsOn: "2027-05-31", isCurrent: true }],
      },
    };
  }
  async getSeasonTeams(): Promise<ProviderTeam[]> {
    this.calls.push("teams");
    return [team("T1", "Thuisclub"), team("T2", "Uitclub")];
  }
  async getMatchesBetween(): Promise<ProviderMatch[]> {
    this.calls.push("between");
    if (this.failWith) throw this.failWith;
    return this.matches.map((m) => ({ ...m, details: {} }));
  }
  async getMatchesByIds(ids: string[]): Promise<ProviderMatch[]> {
    this.calls.push(`ids:${ids.join(",")}`);
    if (this.failWith) throw this.failWith;
    return this.matches.filter((m) => ids.includes(m.externalId));
  }
  async getStandings(): Promise<ProviderStanding[] | null> {
    this.calls.push("standings");
    return this.standings;
  }
}
