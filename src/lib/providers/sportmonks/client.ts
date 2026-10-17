import type { CatalogCompetition } from "@/lib/football/catalog";
import type { ProviderMatch, ProviderStanding, ProviderTeam } from "@/lib/football/model";
import { getJson, ProviderError } from "../http";
import type { CompetitionLookup, FootballProvider, ProviderContext } from "../types";
import { envelopeSchema, fixtureSchema, leagueSchema, participantSchema, standingSchema } from "./schema";
import { DELETED_STATE, toCompetition, toMatch, toStanding, toTeam } from "./transform";

const BASE = "https://api.sportmonks.com/v3/football";
const MAX_PAGES = 40;
/** /fixtures/multi accepts a limited number of ids per call. */
export const MULTI_LIMIT = 25;

const LIST_INCLUDES = "participants;scores;state;round;stage;venue";
const DETAIL_INCLUDES = "participants;scores;state;periods;round;stage;venue;events.type;lineups;statistics.type;formations";

type Query = Record<string, string | number | undefined>;

export class SportmonksProvider implements FootballProvider {
  readonly id = "sportmonks" as const;
  readonly label = "Sportmonks Football API v3";
  readonly isDemo = false;

  constructor(
    private readonly token: string,
    private readonly ctx: ProviderContext = {},
  ) {}

  private async request(path: string, query: Query = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    // The token goes in a header, never in the URL, so it cannot end up in access logs.
    const { body } = await getJson(
      url,
      { Authorization: this.token },
      {
        fetchImpl: this.ctx.fetchImpl,
        sleep: this.ctx.sleep,
        onRequest: this.ctx.onRequest,
        rateRemaining: (_headers, b) => {
          const remaining = (b as { rate_limit?: { remaining?: unknown } } | null)?.rate_limit?.remaining;
          return typeof remaining === "number" ? remaining : null;
        },
      },
    );
    const envelope = envelopeSchema.safeParse(body);
    if (!envelope.success) throw new ProviderError("Onverwacht antwoord van Sportmonks", "invalid_response");
    return envelope.data;
  }

  /** All pages of a list endpoint. A response without `data` means "no results or no access". */
  private async list(path: string, query: Query): Promise<unknown[]> {
    const items: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.request(path, { ...query, per_page: 50, page });
      if (Array.isArray(res.data)) items.push(...res.data);
      else if (res.data !== undefined && res.data !== null) throw new ProviderError("Sportmonks gaf geen lijst terug", "invalid_response");
      if (!res.pagination?.has_more) return items;
    }
    throw new ProviderError(`Meer dan ${MAX_PAGES} pagina's; verklein het datumbereik`, "invalid_response");
  }

  private parseFixtures(rows: unknown[], details: boolean): ProviderMatch[] {
    const out: ProviderMatch[] = [];
    for (const row of rows) {
      const parsed = fixtureSchema.safeParse(row);
      if (!parsed.success)
        throw new ProviderError(`Wedstrijd met onverwacht formaat: ${parsed.error.issues[0]?.path.join(".")}`, "invalid_response");
      if (parsed.data.state?.developer_name === DELETED_STATE || parsed.data.state_id === 20) continue;
      const match = toMatch(parsed.data, { details });
      if (match) out.push(match);
    }
    return out;
  }

  async getCompetition(entry: CatalogCompetition): Promise<CompetitionLookup> {
    try {
      const res = await this.request(`/leagues/${entry.providers.sportmonks}`, { include: "currentSeason;seasons" });
      if (!res.data) return { status: "unavailable", note: res.message ?? "Niet in het huidige Sportmonks-abonnement." };
      const league = leagueSchema.safeParse(res.data);
      if (!league.success) throw new ProviderError("Competitie met onverwacht formaat", "invalid_response");
      return { status: "available", competition: toCompetition(league.data) };
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "forbidden" || err.kind === "not_found")) {
        return {
          status: "unavailable",
          note: err.kind === "forbidden" ? "Geen toegang met het huidige abonnement." : "Onbekend bij Sportmonks.",
        };
      }
      throw err;
    }
  }

  async getSeasonTeams(seasonExternalId: string): Promise<ProviderTeam[]> {
    const rows = await this.list(`/teams/seasons/${seasonExternalId}`, { include: "venue;country" });
    return rows.flatMap((row) => {
      const parsed = participantSchema.safeParse(row);
      return parsed.success ? [toTeam(parsed.data)] : [];
    });
  }

  async getMatchesBetween(competitionExternalIds: string[], from: string, to: string): Promise<ProviderMatch[]> {
    if (competitionExternalIds.length === 0) return [];
    const rows = await this.list(`/fixtures/between/${from}/${to}`, {
      include: LIST_INCLUDES,
      filters: `fixtureLeagues:${competitionExternalIds.join(",")}`,
    });
    return this.parseFixtures(rows, false);
  }

  async getMatchesByIds(externalIds: string[]): Promise<ProviderMatch[]> {
    const out: ProviderMatch[] = [];
    for (let i = 0; i < externalIds.length; i += MULTI_LIMIT) {
      const ids = externalIds.slice(i, i + MULTI_LIMIT);
      const res = await this.request(`/fixtures/multi/${ids.join(",")}`, { include: DETAIL_INCLUDES });
      const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
      out.push(...this.parseFixtures(rows, true));
    }
    return out;
  }

  async getStandings(seasonExternalId: string): Promise<ProviderStanding[] | null> {
    try {
      const res = await this.request(`/standings/seasons/${seasonExternalId}`, {
        include: "participant;details.type;form;group;stage;rule.type",
      });
      if (!Array.isArray(res.data) || res.data.length === 0) return null;
      const parsedRows = res.data.map((row) => {
        const parsed = standingSchema.safeParse(row);
        if (!parsed.success) throw new ProviderError("Stand met onverwacht formaat", "invalid_response");
        return parsed.data;
      });
      // Seasons with several table stages (qualifying, league phase) get the stage in the group name.
      const stages = new Set(parsedRows.map((r) => r.stage?.name ?? ""));
      const rows: ProviderStanding[] = [];
      for (const row of parsedRows) {
        const standing = toStanding(row);
        if (!standing) continue;
        if (stages.size > 1 && row.stage?.name) standing.groupName = [row.stage.name, standing.groupName].filter(Boolean).join(" – ");
        rows.push(standing);
      }
      return rows;
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "not_found" || err.kind === "forbidden")) return null;
      throw err;
    }
  }
}
