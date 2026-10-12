import { describe, expect, it } from "vitest";
import { type Candidate, compatible, pairKey, suggestPairs } from "@/lib/matching";

const person = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  age: 32,
  gender: "vrouw",
  lookingFor: ["man"],
  ageMin: 25,
  ageMax: 40,
  region: "utrecht",
  intent: "open",
  ...over,
});

describe("matching", () => {
  const anna = person("anna");
  const bram = person("bram", { gender: "man", lookingFor: ["vrouw"] });

  it("requires mutual preferences", () => {
    expect(compatible(anna, bram)).toBe(true);
    expect(compatible(anna, { ...bram, lookingFor: ["man"] })).toBe(false);
    expect(compatible(anna, { ...bram, age: 45 })).toBe(false);
    expect(compatible(anna, { ...bram, ageMax: 30 })).toBe(false);
  });

  it("requires the same region and a compatible intent", () => {
    expect(compatible(anna, { ...bram, region: "amsterdam" })).toBe(false);
    expect(compatible({ ...anna, intent: "relatie" }, { ...bram, intent: "ontdekken" })).toBe(false);
    expect(compatible({ ...anna, intent: "relatie" }, { ...bram, intent: "open" })).toBe(true);
  });

  it("pairs everyone at most once and serves the hardest-to-match first", () => {
    const carla = person("carla", { ageMin: 30, ageMax: 33 }); // only fits dirk
    const dirk = person("dirk", { gender: "man", lookingFor: ["vrouw"], age: 31 });
    const pairs = suggestPairs([anna, bram, carla, dirk]);
    const keys = pairs.map(([a, b]) => pairKey(a.id, b.id));
    expect(keys).toContain(pairKey("carla", "dirk"));
    expect(keys).toContain(pairKey("anna", "bram"));
    expect(new Set(pairs.flat().map((c) => c.id)).size).toBe(4);
  });

  it("skips excluded pairs", () => {
    expect(suggestPairs([anna, bram], new Set([pairKey("anna", "bram")]))).toEqual([]);
  });
});
