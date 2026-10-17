import { beforeEach, describe, expect, it } from "vitest";
import { readConfig } from "@/lib/env";
import { getMatchDetail, getDayBoard } from "@/lib/football/queries";
import { ProviderError } from "@/lib/providers/http";
import { acquireLease, backoffSeconds } from "@/lib/sync/state";
import { runDueJobs } from "@/lib/sync/scheduler";
import { match, ScriptedProvider, team } from "./fixtures/scripted-provider";
import { clock, demoConfig, freshDb } from "./helpers";
import type { Db } from "@/lib/db";

const cfg = readConfig({
  NODE_ENV: "test",
  DATA_PROVIDER: "sportmonks",
  SPORTMONKS_API_TOKEN: "x".repeat(40),
  COMPETITIONS: "eredivisie,premier-league",
  LIVE_POLL_SECONDS: "30",
});
const count = async (db: Db, table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`))[0].n;

describe("synchronisation with the demo provider (full chain)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("fills the database and is idempotent: a second round changes nothing and duplicates nothing", async () => {
    const now = clock("2026-10-17T13:00:00Z");
    const config = demoConfig();
    await runDueJobs({ db, cfg: config, trigger: "test", now, deadlineMs: 120_000 });
    await runDueJobs({ db, cfg: config, trigger: "test", now, deadlineMs: 120_000 });
    // Let the details backfill finish (50 matches per round) so the comparison below is exact.
    for (let i = 0; i < 12; i++) {
      const r = await runDueJobs({ db, cfg: config, trigger: "test", now, force: true, only: ["details:backfill"] });
      if (/Alle recente wedstrijden/.test(r.jobs[0].message)) break;
    }
    const before = {
      matches: await count(db, "matches"),
      events: await count(db, "match_events"),
      teams: await count(db, "teams"),
      standings: await count(db, "standings"),
    };
    expect(before.matches).toBeGreaterThan(500);
    expect(before.events).toBeGreaterThan(0);
    expect(before.standings).toBe(28);

    const again = await runDueJobs({ db, cfg: config, trigger: "test", now, force: true, deadlineMs: 120_000 });
    expect(again.jobs.filter((j) => j.status === "failed")).toEqual([]);
    const near = again.jobs.find((j) => j.key === "fixtures:near")!;
    expect(near.message).toMatch(/0 nieuw, 0 gewijzigd/);
    expect({
      matches: await count(db, "matches"),
      events: await count(db, "match_events"),
      teams: await count(db, "teams"),
      standings: await count(db, "standings"),
    }).toEqual(before);
    const dupes = await db.query(`select match_id, seq, count(*) from match_events group by 1, 2 having count(*) > 1`);
    expect(dupes).toEqual([]);
  });

  it("only touches the provider when a job is due", async () => {
    const now = clock("2026-10-17T13:00:00Z");
    const config = demoConfig();
    await runDueJobs({ db, cfg: config, trigger: "test", now, deadlineMs: 120_000 });
    await runDueJobs({ db, cfg: config, trigger: "test", now, deadlineMs: 120_000 });
    const quiet = await runDueJobs({ db, cfg: config, trigger: "test", now });
    expect(quiet.jobs).toEqual([]);
    now.advance(31);
    const later = await runDueJobs({ db, cfg: config, trigger: "test", now });
    expect(later.jobs.map((j) => j.key)).toContain("fixtures:near");
    expect(later.jobs.map((j) => j.key)).not.toContain("competitions");
  });

  it("keeps demo rows apart from real-provider rows", async () => {
    const now = clock("2026-10-17T13:00:00Z");
    await runDueJobs({ db, cfg: demoConfig(), trigger: "test", now, deadlineMs: 120_000 });
    const board = await getDayBoard({ db, cfg, provider: "sportmonks", now: now() }, "2026-10-17");
    expect(board.matches).toEqual([]);
  });
});

describe("synchronisation rules (scripted provider)", () => {
  let db: Db;
  let provider: ScriptedProvider;
  const now = clock("2026-10-17T14:00:00Z");
  const run = (opts: Partial<Parameters<typeof runDueJobs>[0]> = {}) =>
    runDueJobs({ db, cfg, trigger: "test", now, provider, deadlineMs: 60_000, ...opts });

  beforeEach(async () => {
    db = await freshDb();
    provider = new ScriptedProvider();
    now.set("2026-10-17T14:00:00Z");
  });

  it("refuses a competition whose name does not match the catalogue", async () => {
    provider.name = "Keuken Kampioen Divisie";
    provider.matches = [match("M1")];
    await run();
    const [c] = await db.query<{ availability: string; availability_note: string }>(
      `select availability, availability_note from competitions where slug = 'eredivisie'`,
    );
    expect(c.availability).toBe("mismatch");
    expect(c.availability_note).toMatch(/Keuken Kampioen Divisie/);
    expect(await count(db, "matches")).toBe(0);
  });

  it("marks competitions outside the subscription as unavailable, without matches", async () => {
    await run();
    const rows = await db.query<{ slug: string; availability: string }>(`select slug, availability from competitions order by slug`);
    expect(rows).toEqual([
      { slug: "eredivisie", availability: "available" },
      { slug: "premier-league", availability: "unavailable" },
    ]);
  });

  it("follows a match from kick-off to full time and applies VAR corrections without duplicates", async () => {
    provider.matches = [match("M1")];
    await run();
    now.set("2026-10-17T14:40:00Z");
    const goal = {
      minute: 9,
      minuteExtra: null,
      teamExternalId: "T1",
      type: "goal" as const,
      playerName: "Speler A",
      playerExternalId: "p1",
      relatedName: null,
      relatedExternalId: null,
      detail: null,
      scoreAfter: "1-0",
    };
    const card = { ...goal, minute: 20, type: "yellow_card" as const, playerName: "Speler B", scoreAfter: null, teamExternalId: "T2" };
    provider.matches = [
      match("M1", {
        status: "first_half",
        minute: 10,
        score: { home: 1, away: 0 },
        details: { events: [goal], statistics: [{ teamExternalId: "T1", values: { possession: 55, saves: null } }], lineups: [] },
      }),
    ];
    await run({ only: ["live"], force: true });
    provider.matches = [
      match("M1", {
        status: "first_half",
        minute: 21,
        score: { home: 1, away: 0 },
        details: { events: [goal, card], statistics: [], lineups: [] },
      }),
    ];
    await run({ only: ["live"], force: true });
    await run({ only: ["live"], force: true });
    expect(await count(db, "match_events")).toBe(2);

    // VAR: the goal is withdrawn by the source.
    provider.matches = [
      match("M1", {
        status: "second_half",
        minute: 50,
        score: { home: 0, away: 0 },
        details: { events: [card], statistics: [], lineups: [] },
      }),
    ];
    await run({ only: ["live"], force: true });
    const read = { db, cfg, provider: "sportmonks", now: now() };
    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    const detail = (await getMatchDetail(read, id))!;
    expect(detail.match.score).toEqual({ home: 0, away: 0 });
    expect(detail.events.map((e) => e.type)).toEqual(["yellow_card"]);
    expect(detail.match.status).toBe("second_half");
  });

  it("stores a statistic without value as unavailable, never as zero", async () => {
    provider.matches = [
      match("M1", {
        status: "first_half",
        minute: 10,
        score: { home: 0, away: 0 },
        details: {
          events: [],
          lineups: [],
          statistics: [
            { teamExternalId: "T1", values: { possession: 55, saves: null } },
            { teamExternalId: "T2", values: { possession: 45 } },
          ],
        },
      }),
    ];
    await run();
    await run({ only: ["live"], force: true });
    const [{ id }] = await db.query<{ id: number }>(`select id from matches where external_id = 'M1'`);
    const detail = (await getMatchDetail({ db, cfg, provider: "sportmonks", now: now() }, id))!;
    expect(detail.statistics).toEqual([
      { key: "possession", home: 55, away: 45 },
      { key: "saves", home: null, away: null },
    ]);
  });

  it("removes fixtures the source withdrew, but only after a complete season read", async () => {
    provider.matches = [match("M1"), match("M2", { home: team("T2", "Uitclub"), away: team("T1", "Thuisclub") })];
    await run();
    await run({ only: ["fixtures:season"], force: true });
    expect(await count(db, "matches")).toBe(2);
    provider.matches = [match("M1")];
    const report = await run({ only: ["fixtures:season"], force: true });
    expect(report.jobs[0].message).toMatch(/1 verwijderd/);
    expect(await count(db, "matches")).toBe(1);
  });

  it("backs off after failures and stops the round on an invalid token", async () => {
    await run();
    provider.failWith = new ProviderError("Unauthenticated", "auth", 401);
    const report = await run({ force: true });
    expect(report.status).toBe("partial");
    expect(report.jobs.filter((j) => j.status === "failed")).toHaveLength(1);
    const [state] = await db.query<{ consecutive_failures: number; next_due_at: Date; last_error: string }>(
      `select consecutive_failures, next_due_at, last_error from sync_state where key = 'competitions'`,
    );
    expect(state.consecutive_failures).toBe(1);
    expect(new Date(state.next_due_at).getTime()).toBe(now().getTime() + 60_000);
    expect(state.last_error).toMatch(/auth/);
    const runs = await db.query<{ status: string }>(`select status from sync_runs where status = 'failed'`);
    expect(runs).toHaveLength(1);
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(4)).toBe(480);
    expect(backoffSeconds(20)).toBe(3600);
    expect(backoffSeconds(1, 1800)).toBe(1800);
  });

  it("never runs the same job twice at the same time", async () => {
    const t = now();
    expect(await acquireLease(db, "live", "a", 60, t)).toBe(true);
    expect(await acquireLease(db, "live", "b", 60, t)).toBe(false);
    expect(await acquireLease(db, "live", "b", 60, new Date(t.getTime() + 61_000))).toBe(true);
    await run();
    await db.query(`update sync_state set lock_owner = 'elsewhere', lock_until = $1 where key = 'live'`, [new Date(t.getTime() + 60_000)]);
    const report = await run({ only: ["live"], force: true });
    expect(report.jobs[0]).toMatchObject({ key: "live", status: "skipped", message: "Draait al elders" });
  });

  it("respects the daily request budget, keeping the rest for live updates", async () => {
    const budget = readConfig({
      ...process.env,
      NODE_ENV: "test",
      DATA_PROVIDER: "sportmonks",
      SPORTMONKS_API_TOKEN: "x".repeat(40),
      COMPETITIONS: "eredivisie",
      PROVIDER_DAILY_BUDGET: "10",
    });
    await runDueJobs({ db, cfg: budget, trigger: "test", now, provider, deadlineMs: 60_000 });
    await db.query(
      `insert into provider_usage (provider, day, requests) values ('sportmonks', '2026-10-17', 9) on conflict (provider, day) do update set requests = 9`,
    );
    const report = await runDueJobs({ db, cfg: budget, trigger: "test", now, provider, force: true, only: ["standings", "live"] });
    expect(report.jobs.find((j) => j.key === "standings")!.message).toMatch(/Dagbudget/);
    expect(report.jobs.find((j) => j.key === "live")!.status).toBe("success");
  });

  it("does nothing without a configured provider", async () => {
    const none = readConfig({ NODE_ENV: "test" });
    expect(await runDueJobs({ db, cfg: none, trigger: "test", now })).toEqual({ provider: null, status: "unconfigured", jobs: [] });
  });
});
