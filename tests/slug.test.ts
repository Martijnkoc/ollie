import { describe, expect, it } from "vitest";
import { matchPath } from "@/lib/football/queries";
import { parseSlugId, slugify, teamPath } from "@/lib/slug";

describe("stable, readable URLs", () => {
  it("slugifies club names with accents and symbols", () => {
    expect(slugify("1. FC Köln")).toBe("1-fc-koln");
    expect(slugify("Brøndby IF")).toBe("brondby-if");
    expect(slugify("Brighton & Hove Albion")).toBe("brighton-en-hove-albion");
    expect(slugify("Dijkveld '08")).toBe("dijkveld-08");
    expect(slugify("!!!")).toBe("item");
  });

  it("puts our own id at the end and parses it back", () => {
    expect(teamPath({ id: 12, slug: "ajax" })).toBe("/team/ajax-12");
    expect(parseSlugId("ajax-12")).toEqual({ slug: "ajax", id: 12 });
    expect(parseSlugId("go-ahead-eagles-7")).toEqual({ slug: "go-ahead-eagles", id: 7 });
    expect(parseSlugId("12")).toEqual({ slug: "", id: 12 });
    expect(parseSlugId("ajax")).toBeNull();
    expect(parseSlugId("ajax-0")).toBeNull();
    expect(parseSlugId("ajax-12; drop table")).toBeNull();
  });

  it("names match pages after the Dutch calendar day of kick-off", () => {
    expect(matchPath(5, "Ajax", "PSV", new Date("2026-10-17T22:30:00Z"))).toBe("/wedstrijd/ajax-psv-2026-10-18-5");
  });
});
