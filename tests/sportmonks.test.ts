import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/football/catalog";
import { ProviderError } from "@/lib/providers/http";
import { SportmonksProvider } from "@/lib/providers/sportmonks/client";
import { fixtureSchema, standingSchema } from "@/lib/providers/sportmonks/schema";
import { liveMinute, toMatch, toStanding } from "@/lib/providers/sportmonks/transform";
import * as sm from "./fixtures/sportmonks";
import { fakeFetch, json, noSleep } from "./helpers";

const TOKEN = "TESTTOKENabcdefghijklmnopqrstuvwxyz0123456789";
const parse = (raw: unknown) => fixtureSchema.parse(raw);

describe("Sportmonks fixtures → internal model", () => {
  it("maps a finished match with score, half-time score, venue and round", () => {
    const m = toMatch(parse(sm.fixture()), { details: false })!;
    expect(m.externalId).toBe("18535517");
    expect(m.status).toBe("finished");
    expect(m.kickoffAt.toISOString()).toBe(new Date(1792236600 * 1000).toISOString());
    expect(m.home.name).toBe("Celtic");
    expect(m.away.externalId).toBe("62");
    expect(m.score).toEqual({ home: 2, away: 1 });
    expect(m.halftime).toEqual({ home: 1, away: 0 });
    expect(m.penalties).toEqual({ home: null, away: null });
    expect(m.roundName).toBe("9");
    expect(m.venueName).toBe("Celtic Park");
    expect(m.details).toEqual({});
  });

  it("gives a postponed match no score at all", () => {
    const m = toMatch(parse(sm.fixture({ state_id: 10, state: sm.state(10, "POSTPONED", "Postponed"), scores: [] })), { details: false })!;
    expect(m.status).toBe("postponed");
    expect(m.score).toEqual({ home: null, away: null });
  });

  it("falls back to the numeric state id when the state include is missing", () => {
    const m = toMatch(parse(sm.fixture({ state: undefined, state_id: 3 })), { details: false })!;
    expect(m.status).toBe("half_time");
    const unknown = toMatch(parse(sm.fixture({ state: undefined, state_id: 999 })), { details: false })!;
    expect(unknown.status).toBe("unknown");
  });

  it("reads penalties from a shoot-out score", () => {
    const m = toMatch(
      parse(
        sm.fixture({
          state: sm.state(8, "FT_PEN"),
          scores: [
            sm.score("CURRENT", "home", 1, 2650),
            sm.score("CURRENT", "away", 1, 62),
            sm.score("PENALTY_SHOOTOUT", "home", 4, 2650),
            sm.score("PENALTY_SHOOTOUT", "away", 5, 62),
          ],
        }),
      ),
      { details: false },
    )!;
    expect(m.status).toBe("finished_pen");
    expect(m.score).toEqual({ home: 1, away: 1 });
    expect(m.penalties).toEqual({ home: 4, away: 5 });
  });

  it("derives the live minute, including stoppage time, from the ticking period", () => {
    const f = parse(
      sm.fixture({
        state: sm.state(2, "INPLAY_1ST_HALF"),
        periods: [{ ticking: true, started: 1, ended: null, minutes: 47, counts_from: 0, period_length: 45, description: "1st-half" }],
      }),
    );
    expect(liveMinute(f)).toEqual({ minute: 45, extra: 2 });
    const m = toMatch(f, { details: false })!;
    expect(m.minute).toBe(45);
    expect(m.minuteExtra).toBe(2);
    const second = parse(
      sm.fixture({ state: sm.state(22, "INPLAY_2ND_HALF"), periods: [{ ticking: true, minutes: 63, counts_from: 45, period_length: 45 }] }),
    );
    expect(liveMinute(second)).toEqual({ minute: 63, extra: null });
  });

  it("maps events: substitutions in/out, own goals, VAR-cancelled goals and missed penalties", () => {
    const m = toMatch(parse(sm.fixture({ events: sm.events, lineups: [], statistics: [] })), { details: true })!;
    const events = m.details.events!;
    expect(events.map((e) => e.type)).toEqual(["goal", "yellow_card", "missed_penalty", "own_goal", "substitution", "var", "penalty_goal"]);
    const sub = events.find((e) => e.type === "substitution")!;
    expect(sub.playerName).toBe("L. Palma"); // on
    expect(sub.relatedName).toBe("K. Furuhashi"); // off
    expect(events.find((e) => e.type === "missed_penalty")).toMatchObject({ minute: 44, minuteExtra: 2, scoreAfter: null });
    expect(events.find((e) => e.type === "var")!.detail).toMatch(/afgekeurd/);
    // Unknown event types (corners) are dropped rather than guessed.
    expect(events.some((e) => e.minute === 89)).toBe(false);
  });

  it("keeps missing statistics missing: null stays null, unknown types are ignored", () => {
    const m = toMatch(parse(sm.fixture({ events: [], lineups: [], statistics: sm.statistics })), { details: true })!;
    const home = m.details.statistics!.find((s) => s.teamExternalId === "2650")!.values;
    const away = m.details.statistics!.find((s) => s.teamExternalId === "62")!.values;
    expect(home.possession).toBe(61);
    expect(home.shots_total).toBe(14);
    expect(home.saves).toBeNull();
    expect("saves" in away).toBe(false);
    expect(away.pass_accuracy).toBe(78.5);
    expect(Object.keys(away)).not.toContain("SOMETHING_NEW");
    expect("corners" in home).toBe(false);
  });

  it("splits line-ups into starters and bench with formations", () => {
    const m = toMatch(parse(sm.fixture({ events: [], lineups: sm.lineups, statistics: [], formations: sm.formations })), {
      details: true,
    })!;
    const [home, away] = m.details.lineups!;
    expect(home.formation).toBe("4-3-3");
    expect(home.starters.map((p) => p.name)).toEqual(["J. Hart", "A. Johnston"]);
    expect(home.starters[0].position).toBe("K");
    expect(home.substitutes.map((p) => p.name)).toEqual(["O. Abada"]);
    expect(away.formation).toBe("4-2-3-1");
  });

  it("returns an empty list, not undefined, when details were requested but are absent", () => {
    const m = toMatch(parse(sm.fixture({ events: undefined, lineups: undefined, statistics: undefined })), { details: true })!;
    expect(m.details).toEqual({ events: [], lineups: [], statistics: [] });
  });

  it("maps standings from typed details, computing only the goal difference", () => {
    const [first, second] = sm.standings.map((s) => toStanding(standingSchema.parse(s))!);
    expect(first).toMatchObject({
      rank: 1,
      points: 25,
      played: 9,
      won: 8,
      drawn: 1,
      lost: 0,
      goalsFor: 24,
      goalsAgainst: 5,
      goalDiff: 19,
      form: "WGV",
      description: "Champions League",
    });
    expect(second).toMatchObject({ rank: 2, played: 9, won: null, goalsFor: null, goalDiff: null, form: null });
  });
});

describe("Sportmonks client", () => {
  const entry = CATALOG.find((c) => c.slug === "scottish-premiership")!;

  it("sends the token in a header, never in the URL, and follows pagination", async () => {
    const f = fakeFetch((url) => {
      const page = Number(url.searchParams.get("page"));
      return json(
        sm.envelope([sm.fixture({ id: 100 + page })], { pagination: { count: 1, per_page: 50, current_page: page, has_more: page < 3 } }),
      );
    });
    const provider = new SportmonksProvider(TOKEN, { fetchImpl: f.impl, sleep: noSleep });
    const matches = await provider.getMatchesBetween(["501"], "2026-10-15", "2026-10-22");
    expect(matches.map((m) => m.externalId)).toEqual(["101", "102", "103"]);
    expect(f.calls).toHaveLength(3);
    for (const c of f.calls) {
      expect(c.url.toString()).not.toContain(TOKEN);
      expect(c.headers.authorization).toBe(TOKEN);
      expect(c.url.searchParams.get("filters")).toBe("fixtureLeagues:501");
    }
    expect(f.calls[0].url.pathname).toBe("/v3/football/fixtures/between/2026-10-15/2026-10-22");
  });

  it("treats a response without data as 'not in the subscription'", async () => {
    const f = fakeFetch(() =>
      json({
        message:
          "No result(s) found matching your request. Either the query did not return any results or you don't have access to it via your current subscription.",
      }),
    );
    const provider = new SportmonksProvider(TOKEN, { fetchImpl: f.impl, sleep: noSleep });
    const lookup = await provider.getCompetition(entry);
    expect(lookup.status).toBe("unavailable");
    expect(await provider.getMatchesBetween(["501"], "2026-10-15", "2026-10-22")).toEqual([]);
  });

  it("reads a league with its current and previous seasons", async () => {
    const f = fakeFetch(() => json(sm.envelope(sm.league)));
    const lookup = await new SportmonksProvider(TOKEN, { fetchImpl: f.impl }).getCompetition(entry);
    expect(lookup.status).toBe("available");
    if (lookup.status !== "available") return;
    expect(lookup.competition.seasons[0]).toMatchObject({ externalId: "23690", isCurrent: true, startYear: 2026 });
    expect(lookup.competition.seasons[1]).toMatchObject({ externalId: "21787", isCurrent: false, startYear: 2025 });
  });

  it("does not retry an invalid token and keeps the token out of the error", async () => {
    const f = fakeFetch(() => json({ message: `Unauthenticated token ${TOKEN}` }, 401));
    const provider = new SportmonksProvider(TOKEN, { fetchImpl: f.impl, sleep: noSleep });
    const err = await provider.getMatchesByIds(["1"]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("auth");
    expect(err.message).not.toContain(TOKEN);
    expect(f.calls).toHaveLength(1);
  });

  it("retries server errors and short rate limits with back-off, then succeeds", async () => {
    const sleeps: number[] = [];
    const f = fakeFetch((_u, _i, call) =>
      call === 1
        ? json({ message: "oops" }, 503)
        : call === 2
          ? json({ message: "slow down" }, 429, { "retry-after": "1" })
          : json(sm.envelope([sm.fixture()])),
    );
    const provider = new SportmonksProvider(TOKEN, { fetchImpl: f.impl, sleep: async (ms) => void sleeps.push(ms) });
    const matches = await provider.getMatchesByIds(["18535517"]);
    expect(matches).toHaveLength(1);
    expect(f.calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThanOrEqual(1000);
  });

  it("gives up at once on a long rate-limit cool-down so the scheduler can back off", async () => {
    const f = fakeFetch(() => json({ message: "Too many requests" }, 429, { "retry-after": "1800" }));
    const err = await new SportmonksProvider(TOKEN, { fetchImpl: f.impl, sleep: noSleep }).getMatchesByIds(["1"]).catch((e) => e);
    expect(err.kind).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBe(1800);
    expect(f.calls).toHaveLength(1);
  });

  it("reports time-outs and network failures after the retries are used up", async () => {
    const timeout = fakeFetch(() =>
      Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })),
    );
    const err = await new SportmonksProvider(TOKEN, { fetchImpl: timeout.impl, sleep: noSleep }).getMatchesByIds(["1"]).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(timeout.calls).toHaveLength(3);
    const network = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(
      (await new SportmonksProvider(TOKEN, { fetchImpl: network.impl, sleep: noSleep }).getMatchesByIds(["1"]).catch((e) => e)).kind,
    ).toBe("network");
  });

  it("rejects malformed responses instead of storing them", async () => {
    const notJson = fakeFetch(() => new Response("<html>gateway</html>", { status: 200 }));
    expect((await new SportmonksProvider(TOKEN, { fetchImpl: notJson.impl }).getMatchesByIds(["1"]).catch((e) => e)).kind).toBe(
      "invalid_response",
    );
    const wrongShape = fakeFetch(() => json(sm.envelope([{ id: 1, league_id: 501 }])));
    expect((await new SportmonksProvider(TOKEN, { fetchImpl: wrongShape.impl }).getMatchesByIds(["1"]).catch((e) => e)).kind).toBe(
      "invalid_response",
    );
  });

  it("drops fixtures the source has deleted", async () => {
    const f = fakeFetch(() => json(sm.envelope([sm.fixture({ id: 1, state: sm.state(20, "DELETED") }), sm.fixture({ id: 2 })])));
    const matches = await new SportmonksProvider(TOKEN, { fetchImpl: f.impl }).getMatchesByIds(["1", "2"]);
    expect(matches.map((m) => m.externalId)).toEqual(["2"]);
  });

  it("batches detail requests", async () => {
    const f = fakeFetch(() => json(sm.envelope([])));
    await new SportmonksProvider(TOKEN, { fetchImpl: f.impl }).getMatchesByIds(Array.from({ length: 60 }, (_, i) => String(i + 1)));
    expect(f.calls).toHaveLength(3);
    expect(f.calls[0].url.pathname.split("/").pop()!.split(",")).toHaveLength(25);
    expect(f.calls[0].url.searchParams.get("include")).toContain("events.type");
  });

  it("returns null standings for knock-out only seasons", async () => {
    const f = fakeFetch(() => json(sm.envelope([])));
    expect(await new SportmonksProvider(TOKEN, { fetchImpl: f.impl }).getStandings("1")).toBeNull();
  });
});
