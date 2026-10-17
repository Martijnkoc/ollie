import { beforeEach, describe, expect, it } from "vitest";
import { analysisFor } from "@/lib/ai/analyses";
import { buildAnalysisInput, type AnalysisInput } from "@/lib/ai/input";
import { syncAnalyses } from "@/lib/ai/job";
import type { Analysis } from "@/lib/ai/schema";
import { AnalysisRefused, type AnalysisService } from "@/lib/ai/service";
import { numbersIn, validateAnalysis } from "@/lib/ai/validate";
import type { Db } from "@/lib/db";
import { readConfig } from "@/lib/env";
import { getMatchDetail } from "@/lib/football/queries";
import { runDueJobs } from "@/lib/sync/scheduler";
import { match, ScriptedProvider } from "./fixtures/scripted-provider";
import { clock, freshDb } from "./helpers";

const input = {
  kind: "review",
  match: { home: "Thuisclub", away: "Uitclub", score: { home: 2, away: 1 }, kickoff_utc: "2026-10-17T14:30:00.000Z" },
  statistics: [{ name: "Balbezit", home: 55, away: 45 }],
  standings: [{ team: "Thuisclub", rank: 3, points: 19 }],
};

const good = (over: Partial<Analysis> = {}): Analysis => ({
  headline: "Thuisclub wint met 2-1 van Uitclub",
  summary: "Thuisclub won met 2-1. Het had 55 procent balbezit en staat derde met 19 punten.",
  sections: [
    {
      title: "Verloop",
      points: [
        { kind: "fact", text: "De eindstand was 2-1." },
        { kind: "statistic", text: "Thuisclub had 55% balbezit tegen 45% voor Uitclub." },
        {
          kind: "interpretation",
          text: "Thuisclub had meer controle, maar het verschil bleef klein; ruim 30 minuten lang gebeurde er weinig.",
        },
      ],
    },
  ],
  uncertainties: ["Er zijn alleen basisstatistieken beschikbaar."],
  missing_data: ["opstellingen"],
  ...over,
});

describe("AI output validation", () => {
  it("accepts an analysis whose facts come from the input", () => {
    expect(validateAnalysis(good(), input, "review")).toEqual({ ok: true, analysis: good() });
  });

  it("collects every number in the input, including dates and array lengths", () => {
    const n = numbersIn(input);
    for (const x of ["2", "1", "55", "45", "19", "3", "2026"]) expect(n.has(x)).toBe(true);
    // Dates only contribute their year, so "17" (the day) does not become an allowed number.
    expect(n.has("17")).toBe(false);
  });

  it("rejects facts with numbers that are not in the data", () => {
    const v = validateAnalysis(
      good({ sections: [{ title: "Verloop", points: [{ kind: "fact", text: "Thuisclub schoot 17 keer op doel." }] }] }),
      input,
      "review",
    );
    expect(v).toMatchObject({ ok: false });
    if (!v.ok) expect(v.reason).toMatch(/"17"/);
    // The same number in an interpretation is tolerated (it is labelled as interpretation)...
    expect(validateAnalysis(good(), input, "review").ok).toBe(true);
    // ...but not in the summary.
    expect(validateAnalysis(good({ summary: "Thuisclub kreeg 12 kansen en won verdiend met 2-1 van Uitclub." }), input, "review").ok).toBe(
      false,
    );
  });

  it("rejects probabilities, betting language and certainty about the future", () => {
    expect(validateAnalysis(good({ uncertainties: ["Er is 60% kans op een overwinning."] }), { ...input, x: 60 }, "preview")).toMatchObject(
      { ok: false },
    );
    expect(
      validateAnalysis(
        good({ summary: "Een interessante wedstrijd om op te wedden voor wie houdt van doelpunten en spanning." }),
        input,
        "review",
      ),
    ).toMatchObject({
      ok: false,
    });
    const certain = good({ headline: "Thuisclub gaat zeker winnen van Uitclub" });
    expect(validateAnalysis(certain, input, "preview")).toMatchObject({ ok: false });
    expect(validateAnalysis(good({ uncertainties: [] }), input, "preview")).toMatchObject({ ok: false });
  });

  it("rejects malformed output", () => {
    expect(validateAnalysis({ headline: "x" }, input, "review").ok).toBe(false);
    expect(validateAnalysis(null, input, "review").ok).toBe(false);
    expect(validateAnalysis(good({ sections: [] }), input, "review").ok).toBe(false);
  });
});

class FakeService implements AnalysisService {
  readonly provider = "fake";
  readonly model = "fake-model";
  calls: AnalysisInput[] = [];
  constructor(private readonly respond: (input: AnalysisInput) => unknown) {}
  async generate(i: AnalysisInput) {
    this.calls.push(i);
    const raw = this.respond(i);
    if (raw instanceof Error) throw raw;
    return { raw, model: this.model, inputTokens: 1000, outputTokens: 300 };
  }
}

const previewFor = (i: AnalysisInput): Analysis => ({
  headline: `${i.match.home} tegen ${i.match.away}`,
  summary: `${i.match.home} speelt thuis tegen ${i.match.away} in de ${i.match.competition}.`,
  sections: [
    {
      title: "Vooraf",
      points: [{ kind: "interpretation", text: "Op basis van de beschikbare gegevens is weinig te zeggen over de verhoudingen." }],
    },
  ],
  uncertainties: ["Er zijn nog geen onderlinge resultaten opgeslagen."],
  missing_data: i.missing,
});

describe("AI analyses in the sync pipeline", () => {
  let db: Db;
  let provider: ScriptedProvider;
  const now = clock("2026-10-17T10:00:00Z");
  const cfg = readConfig({
    NODE_ENV: "test",
    DATA_PROVIDER: "sportmonks",
    SPORTMONKS_API_TOKEN: "x".repeat(40),
    COMPETITIONS: "eredivisie",
    ANTHROPIC_API_KEY: "test",
    AI_DAILY_LIMIT: "3",
  });
  const read = () => ({ db, cfg, provider: "sportmonks", now: now() });

  beforeEach(async () => {
    db = await freshDb();
    now.set("2026-10-17T10:00:00Z");
    provider = new ScriptedProvider();
    provider.matches = [match("M1", { kickoffAt: new Date("2026-10-17T18:00:00Z") })];
    await runDueJobs({ db, cfg, trigger: "test", now, provider, only: ["competitions", "fixtures:near"] });
  });

  it("generates a preview once, caches it by input, and shows it while it is current", async () => {
    const service = new FakeService(previewFor);
    const ctx = { db, cfg, provider, now };
    expect((await syncAnalyses(ctx, service)).message).toMatch(/^1 analyses gemaakt/);
    expect(service.calls).toHaveLength(1);
    expect(service.calls[0].kind).toBe("preview");
    expect(service.calls[0].match.score).toBeNull();
    expect(service.calls[0].missing).toContain("opstellingen");

    now.advance(7 * 60);
    await syncAnalyses(ctx, service);
    expect(service.calls).toHaveLength(1);

    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    const view = await analysisFor(read(), (await getMatchDetail(read(), id))!, true);
    expect(view.state).toBe("current");
  });

  it("hides an analysis as soon as the facts it was based on change", async () => {
    await syncAnalyses({ db, cfg, provider, now }, new FakeService(previewFor));
    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    // The kick-off moves: the stored preview no longer matches the data.
    await db.query(`update matches set venue_name = 'Ander stadion' where id = $1`, [id]);
    const view = await analysisFor(read(), (await getMatchDetail(read(), id))!, true);
    expect(view.state).toBe("outdated");
  });

  it("stores rejected and failed attempts for audit but never shows them", async () => {
    const lying = new FakeService((i) => ({
      ...previewFor(i),
      summary: "Thuisclub won de laatste 8 duels op rij, zo blijkt uit de cijfers.",
    }));
    expect((await syncAnalyses({ db, cfg, provider, now }, lying)).message).toMatch(/1 afgekeurd/);
    const rows = await db.query<{ status: string; note: string }>(`select status, note from ai_analyses`);
    expect(rows).toEqual([{ status: "rejected", note: expect.stringMatching(/"8"/) }]);
    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    expect((await analysisFor(read(), (await getMatchDetail(read(), id))!, true)).state).toBe("none");

    await db.query(`delete from ai_analyses`);
    const refusing = new FakeService(() => new AnalysisRefused("Model weigerde (null)"));
    expect((await syncAnalyses({ db, cfg, provider, now }, refusing)).message).toMatch(/1 mislukt/);
    expect((await db.query<{ status: string }>(`select status from ai_analyses`))[0].status).toBe("failed");
  });

  it("respects the daily limit and does nothing without a configured service", async () => {
    await db.query(
      `insert into ai_analyses (match_id, kind, input_hash, status, ai_provider, model, data_as_of, created_at)
       select id, 'review', 'h' || g, 'ok', 'fake', 'fake', now(), $1 from matches, generate_series(1, 3) g`,
      [now()],
    );
    const service = new FakeService(previewFor);
    expect((await syncAnalyses({ db, cfg, provider, now }, service)).message).toMatch(/Daglimiet/);
    expect(service.calls).toHaveLength(0);
    expect((await syncAnalyses({ db, cfg, provider, now }, null)).message).toMatch(/niet geconfigureerd/);
  });

  it("builds review input only from stored events and statistics", async () => {
    provider.matches = [
      match("M1", {
        kickoffAt: new Date("2026-10-17T07:00:00Z"),
        status: "finished",
        score: { home: 1, away: 0 },
        details: {
          events: [
            {
              minute: 9,
              minuteExtra: null,
              teamExternalId: "T1",
              type: "goal",
              playerName: "Speler A",
              playerExternalId: null,
              relatedName: null,
              relatedExternalId: null,
              detail: null,
              scoreAfter: "1-0",
            },
          ],
          lineups: [],
          statistics: [],
        },
      }),
    ];
    await runDueJobs({ db, cfg, trigger: "test", now, provider, only: ["fixtures:near", "live"], force: true });
    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    const i = buildAnalysisInput((await getMatchDetail(read(), id))!, "review", "Sportmonks");
    expect(i.match.score).toEqual({ home: 1, away: 0 });
    expect(i.events).toEqual([{ minute: "9", team: "Thuisclub", type: "doelpunt", player: "Speler A", related: null }]);
    expect(i.statistics).toBeNull();
    expect(i.missing).toContain("wedstrijdstatistieken");
  });
});
