import type { CatalogCompetition } from "@/lib/football/catalog";
import type {
  EventType,
  LineupPlayer,
  ProviderEvent,
  ProviderLineup,
  ProviderMatch,
  ProviderSeason,
  ProviderStanding,
  ProviderTeam,
  ProviderTeamStats,
} from "@/lib/football/model";
import type { MatchStatus } from "@/lib/football/status";
import { addDays, localDay, startOfLocalDay } from "@/lib/time";
import type { CompetitionLookup, FootballProvider, ProviderContext } from "../types";

/**
 * DEMO DATA — FICTIONAL. Clubs, players, scores and statistics below are invented and only exist
 * so the complete chain (provider → sync → database → API → site) can be developed and tested
 * without a data subscription. The site labels every page in demo mode and blocks indexing.
 *
 * Everything is derived deterministically from the calendar day and the current time, so a
 * re-sync returns the same matches and a live match progresses with the clock.
 */

const TEAMS: Record<string, string[]> = {
  eredivisie: [
    "FC Polderstad",
    "Rivierdam United",
    "SV Duinwijk",
    "Kanaalstede",
    "VV Heidedorp",
    "Molenwaard",
    "Zeehaven FC",
    "Bergweide Boys",
    "Dijkveld '08",
    "Lindeoord",
  ],
  "premier-league": [
    "Ashford Rovers",
    "Kingsbridge Town",
    "Westmoor City",
    "Harrowgate Albion",
    "Fenwick Athletic",
    "Stonebury",
    "Larkhill United",
    "Millbrook Wanderers",
    "Oakhaven",
    "Redcliffe Forest",
  ],
  "champions-league": ["Nordhavn", "Valdoria", "Castelbianco", "Strelnik", "Ostravia", "Monterra", "Lisvale", "Brenburg"],
};

const FIRST = ["Daan", "Luuk", "Sem", "Milan", "Jesse", "Thijs", "Bram", "Ruben", "Noah", "Finn", "Lars", "Stijn", "Tom", "Niels", "Joris", "Koen"];
const LAST = ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "Dekker", "Brouwer", "Kok"];

const COMPETITION_IDS: Record<string, string> = { eredivisie: "d-1", "premier-league": "d-2", "champions-league": "d-3" };
const WINDOW_DAYS = 21;
const MATCH_MINUTES = 112;
/** Kick-offs every 100 minutes from 00:20, so at any time of day one match is being played. */
const SLOT_MINUTES = 100;
const FIRST_SLOT = 20;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dayNumber(day: string) {
  return Math.floor(startOfLocalDay(day).getTime() / 86_400_000);
}

function seasonFor(now: Date, slug: string): ProviderSeason {
  const day = localDay(now);
  const year = Number(day.slice(0, 4));
  const startYear = Number(day.slice(5, 7)) >= 7 ? year : year - 1;
  return {
    externalId: `ds-${slug}-${startYear}`,
    name: `${startYear}/${startYear + 1}`,
    startYear,
    startsOn: `${startYear}-08-01`,
    endsOn: `${startYear + 1}-05-31`,
    isCurrent: true,
  };
}

const slugOfSeason = (seasonExternalId: string) => /^ds-(.+)-\d{4}$/.exec(seasonExternalId)?.[1];

function team(slug: string, index: number): ProviderTeam {
  const name = TEAMS[slug][index];
  return {
    externalId: `dt-${slug}-${index}`,
    name,
    shortName: null,
    code: name.replace(/[^A-Z]/g, "").slice(0, 3) || name.slice(0, 3).toUpperCase(),
    country: null,
    founded: 1900 + (hash(name) % 110),
    logoUrl: null,
    venueName: `Demostadion ${name.split(" ").pop()}`,
    venueCity: null,
    isPlaceholder: false,
  };
}

/** Round-robin pairings (circle method) for round `r`. */
function pairings(teamCount: number, r: number): [number, number][] {
  const n = teamCount;
  const rounds = n - 1;
  const round = ((r % rounds) + rounds) % rounds;
  const ring = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const rotated = ring.map((_, i) => ring[(i + round) % ring.length]);
  const order = [0, ...rotated];
  const out: [number, number][] = [];
  for (let i = 0; i < n / 2; i++) {
    const a = order[i];
    const b = order[n - 1 - i];
    out.push(r % 2 === 0 ? [a, b] : [b, a]);
  }
  return out;
}

interface Planned {
  slug: string;
  day: string;
  index: number;
  slot: number;
  home: number;
  away: number;
  round: number;
}

/** All demo matches of a day. Slots never depend on which competitions a caller asks for. */
function planDay(day: string, slugs: string[]): Planned[] {
  const d = dayNumber(day);
  const planned: Planned[] = [];
  for (const slug of Object.keys(TEAMS)) {
    const round = d;
    for (const [i, [home, away]] of pairings(TEAMS[slug].length, round).entries()) {
      planned.push({ slug, day, index: i, slot: 0, home, away, round });
    }
  }
  // Interleave competitions over the day's slots.
  planned.sort((a, b) => a.index - b.index || a.slug.localeCompare(b.slug));
  planned.forEach((p, i) => (p.slot = i));
  return planned.filter((p) => slugs.includes(p.slug));
}

function kickoffOf(p: Planned) {
  return new Date(startOfLocalDay(p.day).getTime() + (FIRST_SLOT + p.slot * SLOT_MINUTES) * 60_000);
}

interface Script {
  goals: { minute: number; side: "home" | "away"; type: EventType; scorer: number; assist: number | null }[];
  cards: { minute: number; side: "home" | "away"; type: EventType; player: number }[];
  subs: { minute: number; side: "home" | "away"; on: number; off: number }[];
}

function script(seed: number): Script {
  const r = rng(seed);
  const goals: Script["goals"] = [];
  const total = Math.floor(r() * 5);
  for (let i = 0; i < total; i++) {
    const kind = r();
    goals.push({
      minute: 2 + Math.floor(r() * 88),
      side: r() < 0.55 ? "home" : "away",
      type: kind < 0.08 ? "own_goal" : kind < 0.18 ? "penalty_goal" : "goal",
      scorer: 6 + Math.floor(r() * 5),
      assist: r() < 0.6 ? 1 + Math.floor(r() * 9) : null,
    });
  }
  const cards: Script["cards"] = [];
  for (let i = 0; i < Math.floor(r() * 5); i++) {
    cards.push({ minute: 10 + Math.floor(r() * 80), side: r() < 0.5 ? "home" : "away", type: r() < 0.06 ? "red_card" : "yellow_card", player: 1 + Math.floor(r() * 10) });
  }
  const subs: Script["subs"] = [];
  for (const side of ["home", "away"] as const) {
    for (let i = 0; i < 3; i++) subs.push({ minute: 55 + Math.floor(r() * 30), side, on: 11 + i, off: 5 + i * 2 });
  }
  return { goals: goals.sort((a, b) => a.minute - b.minute), cards: cards.sort((a, b) => a.minute - b.minute), subs };
}

function playerName(teamId: string, index: number) {
  const h = hash(`${teamId}:${index}`);
  return `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`;
}

function lineup(t: ProviderTeam, seed: number): ProviderLineup {
  const formation = seed % 2 === 0 ? "4-3-3" : "4-4-2";
  const positions = ["K", "V", "V", "V", "V", "M", "M", "M", "A", "A", "A"];
  const player = (i: number): LineupPlayer => ({
    externalId: `${t.externalId}-p${i}`,
    name: playerName(t.externalId, i),
    number: i + 1,
    position: i < 11 ? positions[i] : null,
    grid: null,
  });
  return {
    teamExternalId: t.externalId,
    formation,
    coachName: playerName(t.externalId, 99),
    starters: Array.from({ length: 11 }, (_, i) => player(i)),
    substitutes: Array.from({ length: 7 }, (_, i) => player(11 + i)),
  };
}

/** Elapsed playing time → status and clock, mimicking 45' halves with a 15' break. */
function progress(elapsedMin: number): { status: MatchStatus; minute: number | null; extra: number | null; played: number } {
  if (elapsedMin < 0) return { status: "scheduled", minute: null, extra: null, played: 0 };
  if (elapsedMin < 45) return { status: "first_half", minute: Math.floor(elapsedMin) + 1, extra: null, played: elapsedMin };
  if (elapsedMin < 47) return { status: "first_half", minute: 45, extra: Math.floor(elapsedMin - 45) + 1, played: 45 };
  if (elapsedMin < 62) return { status: "half_time", minute: null, extra: null, played: 45 };
  if (elapsedMin < 107) return { status: "second_half", minute: Math.floor(elapsedMin - 62) + 46, extra: null, played: elapsedMin - 17 };
  if (elapsedMin < MATCH_MINUTES) return { status: "second_half", minute: 90, extra: Math.floor(elapsedMin - 107) + 1, played: 90 };
  return { status: "finished", minute: null, extra: null, played: 90 };
}

export class DemoProvider implements FootballProvider {
  readonly id = "demo" as const;
  readonly label = "Demo-gegevens (fictief)";
  readonly isDemo = true;
  private readonly now: () => Date;

  constructor(ctx: ProviderContext = {}) {
    this.now = ctx.now ?? (() => new Date());
  }

  async getCompetition(entry: CatalogCompetition): Promise<CompetitionLookup> {
    if (!TEAMS[entry.slug]) return { status: "unavailable", note: "Niet opgenomen in de demo-omgeving." };
    const season = seasonFor(this.now(), entry.slug);
    return {
      status: "available",
      // The demo source "answers" with the catalogue name so the mismatch check passes.
      competition: { externalId: COMPETITION_IDS[entry.slug], name: entry.name, logoUrl: null, seasons: [season] },
    };
  }

  async getSeasonTeams(seasonExternalId: string): Promise<ProviderTeam[]> {
    const slug = slugOfSeason(seasonExternalId);
    return slug && TEAMS[slug] ? TEAMS[slug].map((_, i) => team(slug, i)) : [];
  }

  private slugsFor(externalIds: string[]) {
    return Object.entries(COMPETITION_IDS)
      .filter(([, ext]) => externalIds.includes(ext))
      .map(([slug]) => slug);
  }

  private build(p: Planned, details: boolean): ProviderMatch {
    const now = this.now();
    const season = seasonFor(now, p.slug);
    const home = team(p.slug, p.home);
    const away = team(p.slug, p.away);
    const kickoff = kickoffOf(p);
    const seed = hash(`${p.slug}:${p.day}:${p.index}`);
    const special = seed % 61;

    let { status, minute, extra, played } = progress((now.getTime() - kickoff.getTime()) / 60_000);
    // A few fixed exceptions so the site always has to show these states correctly.
    if (special === 3 || special === 33) status = "postponed";
    if (special === 7 && status === "scheduled") status = "time_tba";
    if (special === 11 && status === "finished") status = "abandoned";
    const scriptData = script(seed);
    const cut = status === "abandoned" ? 63 : played;
    const counted = status === "postponed" || status === "time_tba" ? [] : scriptData.goals.filter((g) => g.minute <= cut);
    const started = status !== "scheduled" && status !== "postponed" && status !== "time_tba";
    const goalsOf = (side: "home" | "away", upTo = 90) =>
      counted.filter((g) => g.minute <= upTo && (g.type === "own_goal" ? g.side !== side : g.side === side)).length;

    const match: ProviderMatch = {
      externalId: `dm-${p.slug}-${p.day}-${p.index}`,
      competitionExternalId: COMPETITION_IDS[p.slug],
      seasonExternalId: season.externalId,
      stageName: p.slug === "champions-league" ? "League Stage" : "Regular Season",
      roundName: String(((p.round % 30) + 30) % 30 + 1),
      kickoffAt: kickoff,
      status,
      providerStatus: status.toUpperCase(),
      minute: status === "abandoned" ? null : minute,
      minuteExtra: status === "abandoned" ? null : extra,
      home,
      away,
      score: started ? { home: goalsOf("home"), away: goalsOf("away") } : { home: null, away: null },
      halftime: started && played >= 45 ? { home: goalsOf("home", 45), away: goalsOf("away", 45) } : { home: null, away: null },
      extraTime: { home: null, away: null },
      penalties: { home: null, away: null },
      venueName: home.venueName,
      venueCity: null,
      referee: `${playerName("ref", seed % 50)} (demo)`,
      details: {},
    };

    if (details) {
      const events: ProviderEvent[] = [];
      if (started) {
        let h = 0;
        let a = 0;
        for (const g of counted) {
          const benefits = g.type === "own_goal" ? (g.side === "home" ? "away" : "home") : g.side;
          if (benefits === "home") h++;
          else a++;
          const scoringTeam = g.side === "home" ? home : away;
          events.push({
            minute: g.minute,
            minuteExtra: null,
            teamExternalId: scoringTeam.externalId,
            type: g.type,
            playerName: playerName(scoringTeam.externalId, g.scorer),
            playerExternalId: `${scoringTeam.externalId}-p${g.scorer}`,
            relatedName: g.assist !== null && g.type === "goal" ? playerName(scoringTeam.externalId, g.assist) : null,
            relatedExternalId: null,
            detail: null,
            scoreAfter: `${h}-${a}`,
          });
        }
        for (const c of scriptData.cards.filter((c) => c.minute <= cut)) {
          const t = c.side === "home" ? home : away;
          events.push({ minute: c.minute, minuteExtra: null, teamExternalId: t.externalId, type: c.type, playerName: playerName(t.externalId, c.player), playerExternalId: null, relatedName: null, relatedExternalId: null, detail: null, scoreAfter: null });
        }
        for (const s of scriptData.subs.filter((s) => s.minute <= cut)) {
          const t = s.side === "home" ? home : away;
          events.push({ minute: s.minute, minuteExtra: null, teamExternalId: t.externalId, type: "substitution", playerName: playerName(t.externalId, s.on), playerExternalId: null, relatedName: playerName(t.externalId, s.off), relatedExternalId: null, detail: null, scoreAfter: null });
        }
        events.sort((x, y) => (x.minute ?? 0) - (y.minute ?? 0));
      }
      const r = rng(seed ^ 0x9e3779b9);
      const share = 38 + Math.floor(r() * 25);
      const frac = Math.min(1, played / 90);
      const stat = (base: number) => Math.round(base * frac);
      const statistics: ProviderTeamStats[] = started
        ? (["home", "away"] as const).map((side) => {
            const t = side === "home" ? home : away;
            const shots = stat(6 + Math.floor(r() * 12));
            return {
              teamExternalId: t.externalId,
              values: {
                possession: side === "home" ? share : 100 - share,
                shots_total: shots,
                shots_on_target: Math.min(shots, stat(2 + Math.floor(r() * 6))),
                corners: stat(1 + Math.floor(r() * 9)),
                fouls: stat(6 + Math.floor(r() * 10)),
                yellow_cards: scriptData.cards.filter((c) => c.minute <= cut && c.side === side && c.type === "yellow_card").length,
                // Deliberately not supplied for some matches: the site must show "niet beschikbaar", not 0.
                ...(seed % 3 === 0 ? {} : { saves: stat(1 + Math.floor(r() * 6)) }),
              },
            };
          })
        : [];
      const kickoffSoon = kickoff.getTime() - now.getTime() < 60 * 60_000;
      match.details = {
        events,
        lineups: started || kickoffSoon ? [lineup(home, seed), lineup(away, seed + 1)] : [],
        statistics,
      };
    }
    return match;
  }

  private window(slugs: string[], from: string, to: string): Planned[] {
    const anchor = localDay(this.now());
    const first = addDays(anchor, -WINDOW_DAYS);
    const last = addDays(anchor, WINDOW_DAYS);
    const out: Planned[] = [];
    for (let day = from < first ? first : from; day <= to && day <= last; day = addDays(day, 1)) out.push(...planDay(day, slugs));
    return out;
  }

  async getMatchesBetween(competitionExternalIds: string[], from: string, to: string): Promise<ProviderMatch[]> {
    const slugs = this.slugsFor(competitionExternalIds);
    // The window is given in UTC dates; local days overlap by at most one, so widen and filter.
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T23:59:59Z`).getTime();
    return this.window(slugs, addDays(from, -1), addDays(to, 1))
      .filter((p) => {
        const t = kickoffOf(p).getTime();
        return t >= start && t <= end;
      })
      .map((p) => this.build(p, false));
  }

  async getMatchesByIds(externalIds: string[]): Promise<ProviderMatch[]> {
    const out: ProviderMatch[] = [];
    for (const ext of externalIds) {
      const m = /^dm-(.+)-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(ext);
      if (!m || !TEAMS[m[1]]) continue;
      const planned = planDay(m[2], Object.keys(TEAMS)).find((p) => p.slug === m[1] && p.index === Number(m[3]));
      if (planned) out.push(this.build(planned, true));
    }
    return out;
  }

  async getStandings(seasonExternalId: string): Promise<ProviderStanding[] | null> {
    const slug = slugOfSeason(seasonExternalId);
    if (!slug || !TEAMS[slug]) return null;
    const anchor = localDay(this.now());
    const rows: ProviderStanding[] = [];
    {
      const table = TEAMS[slug].map((_, i) => ({ team: team(slug, i), played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, form: [] as string[] }));
      const matches = this.window([slug], addDays(anchor, -WINDOW_DAYS), anchor).map((p) => this.build(p, false));
      for (const m of matches) {
        if (m.status !== "finished" || m.score.home === null || m.score.away === null) continue;
        const h = table.find((t) => t.team.externalId === m.home.externalId)!;
        const a = table.find((t) => t.team.externalId === m.away.externalId)!;
        h.played++;
        a.played++;
        h.gf += m.score.home;
        h.ga += m.score.away;
        a.gf += m.score.away;
        a.ga += m.score.home;
        const result = Math.sign(m.score.home - m.score.away);
        if (result > 0) (h.won++, a.lost++, h.form.push("W"), a.form.push("V"));
        else if (result < 0) (a.won++, h.lost++, a.form.push("W"), h.form.push("V"));
        else (h.drawn++, a.drawn++, h.form.push("G"), a.form.push("G"));
      }
      const pts = (t: (typeof table)[number]) => t.won * 3 + t.drawn;
      table.sort((x, y) => pts(y) - pts(x) || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.team.name.localeCompare(y.team.name));
      table.forEach((t, i) =>
        rows.push({
          groupName: "",
          team: t.team,
          rank: i + 1,
          points: pts(t),
          played: t.played,
          won: t.won,
          drawn: t.drawn,
          lost: t.lost,
          goalsFor: t.gf,
          goalsAgainst: t.ga,
          goalDiff: t.gf - t.ga,
          form: t.form.slice(-5).join("") || null,
          description: null,
        }),
      );
    }
    return rows;
  }
}
