import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { saveCompetition, saveMatches, saveSeasons, saveStandings } from "@/lib/football/repository";
import { CATALOG } from "@/lib/football/catalog";
import { match, team } from "./fixtures/scripted-provider";
import { freshDb } from "./helpers";

describe("repository writes", () => {
  let db: Db;
  let seasonId: number;
  let competitionId: number;
  const now = new Date("2026-10-17T12:00:00Z");

  beforeEach(async () => {
    db = await freshDb();
    competitionId = await saveCompetition(db, "sportmonks", CATALOG[0], "L1", "available", null, null, now);
    const ids = await saveSeasons(db, "sportmonks", competitionId, [
      { externalId: "S1", name: "2026/2027", startYear: 2026, startsOn: "2026-08-01", endsOn: "2027-05-31", isCurrent: true },
    ]);
    seasonId = ids.get("S1")!;
  });

  it("refuses to run against another application's database", async () => {
    const { connectPglite, migrate } = await import("@/lib/db");
    const other = await connectPglite();
    await other.query(`create table memberships (id int)`);
    await expect(migrate(other)).rejects.toThrow(/andere applicatie/);
  });

  it("upserts matches by external id and reports what changed", async () => {
    const ctx = { provider: "sportmonks", competitionIds: new Map([["L1", competitionId]]), seasonIds: new Map([["S1", seasonId]]), now };
    expect(await saveMatches(db, ctx, [match("M1"), match("M1"), match("M2")])).toMatchObject({ inserted: 2, changed: 0, unchanged: 0 });
    expect(
      await saveMatches(db, { ...ctx, now: new Date(now.getTime() + 60_000) }, [match("M1"), match("M2", { status: "postponed" })]),
    ).toMatchObject({ inserted: 0, changed: 1, unchanged: 1 });
    expect(await saveMatches(db, ctx, [match("M3", { seasonExternalId: "unknown" })])).toMatchObject({ skipped: 1, inserted: 0 });
    const [row] = await db.query<{ status: string; synced_at: Date; changed_at: Date }>(
      `select status, synced_at, changed_at from matches where external_id = 'M2'`,
    );
    expect(row.status).toBe("postponed");
    expect(new Date(row.changed_at).getTime()).toBe(now.getTime() + 60_000);
  });

  it("keeps the better-informed team record when a fixture payload has less detail", async () => {
    const ctx = { provider: "sportmonks", competitionIds: new Map([["L1", competitionId]]), seasonIds: new Map([["S1", seasonId]]), now };
    await saveMatches(db, ctx, [match("M1", { home: { ...team("T1", "Thuisclub"), venueName: "Stadion", founded: 1900 } })]);
    await saveMatches(db, ctx, [match("M1")]);
    const [t] = await db.query<{ venue_name: string; founded: number }>(`select venue_name, founded from teams where external_id = 'T1'`);
    expect(t).toEqual({ venue_name: "Stadion", founded: 1900 });
  });

  it("replaces standings atomically and skips identical versions", async () => {
    const row = (ext: string, rank: number, points: number) => ({
      groupName: "",
      team: team(ext, `Club ${ext}`),
      rank,
      points,
      played: 9,
      won: null,
      drawn: null,
      lost: null,
      goalsFor: null,
      goalsAgainst: null,
      goalDiff: null,
      form: null,
      description: null,
    });
    expect(await saveStandings(db, "sportmonks", seasonId, [row("A", 1, 20), row("B", 2, 18)], now)).toBe(true);
    expect(await saveStandings(db, "sportmonks", seasonId, [row("A", 1, 20), row("B", 2, 18)], now)).toBe(false);
    expect(await saveStandings(db, "sportmonks", seasonId, [row("B", 1, 21), row("A", 2, 20), row("A", 2, 20)], now)).toBe(true);
    const rows = await db.query<{ rank: number; name: string }>(
      `select st.rank, t.name from standings st join teams t on t.id = st.team_id order by rank`,
    );
    expect(rows).toEqual([
      { rank: 1, name: "Club B" },
      { rank: 2, name: "Club A" },
    ]);
    expect(await saveStandings(db, "sportmonks", seasonId, null, now)).toBe(false);
    const [s] = await db.query<{ standings_available: boolean }>(`select standings_available from seasons where id = $1`, [seasonId]);
    expect(s.standings_available).toBe(false);
  });
});
