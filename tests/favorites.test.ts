import { describe, expect, it } from "vitest";
import { parseFavorites, toggled } from "@/lib/favorites";

describe("favourites in local storage", () => {
  it("survives missing, corrupt or tampered storage", () => {
    expect(parseFavorites(null)).toEqual({ teams: [], competitions: [] });
    expect(parseFavorites("{not json")).toEqual({ teams: [], competitions: [] });
    expect(parseFavorites(JSON.stringify({ teams: [1, 1, "2", -3, 4.5, 7], competitions: "x" }))).toEqual({
      teams: [1, 7],
      competitions: [],
    });
  });

  it("toggles ids and keeps the list bounded", () => {
    let f = { teams: [], competitions: [] } as { teams: number[]; competitions: number[] };
    f = toggled(f, "teams", 5);
    expect(f.teams).toEqual([5]);
    f = toggled(f, "teams", 5);
    expect(f.teams).toEqual([]);
    for (let i = 1; i <= 60; i++) f = toggled(f, "competitions", i);
    expect(f.competitions).toHaveLength(50);
    expect(f.competitions[0]).toBe(11);
  });
});
