import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { BRAND, siteUrl } from "@/config/brand";
import { GUIDE_INDEX } from "@/content/guide-index";
import { GUIDES, guideBySlug } from "@/content/guides";

afterEach(() => vi.unstubAllEnvs());

/** Every piece of text a guide shows, so copy rules can be checked in one place. */
function guideText(g: (typeof GUIDES)[number]) {
  const blocks = g.sections.flatMap((s) => [
    s.heading,
    ...s.blocks.flatMap((b) => Object.values(b).flatMap((v) => (Array.isArray(v) ? v.map((x) => JSON.stringify(x)) : [String(v)]))),
  ]);
  return [g.title, g.metaTitle, g.description, g.answer, g.inApp, ...blocks, ...g.faq.flatMap((f) => [f.q, f.a])].join("\n");
}

describe("merkconfiguratie", () => {
  it("de publieke naam komt uit één plek; MaatKlaar blijft de interne naam", () => {
    expect(BRAND.name).toBe("Metrivo");
    expect(BRAND.internalName).toBe("MaatKlaar");
    expect(BRAND.fileSlug).toMatch(/^[a-z0-9-]+$/);
  });

  it("siteUrl gebruikt APP_URL zonder slash aan het eind, anders de standaard", () => {
    vi.stubEnv("APP_URL", "https://voorbeeld.nl/");
    expect(siteUrl()).toBe("https://voorbeeld.nl");
    vi.stubEnv("APP_URL", "");
    expect(siteUrl()).toBe(BRAND.defaultUrl);
  });
});

describe("gidsen", () => {
  it("elke gids uit de index heeft inhoud, in dezelfde volgorde", () => {
    expect(GUIDES.map((g) => g.slug)).toEqual(GUIDE_INDEX.map((g) => g.slug));
    for (const g of GUIDE_INDEX) expect(guideBySlug(g.slug)?.slug).toBe(g.slug);
    expect(guideBySlug("bestaat-niet")).toBeNull();
  });

  it("titels, beschrijvingen en antwoorden zijn uniek (geen dubbele pagina's)", () => {
    for (const key of ["title", "metaTitle", "description", "answer"] as const) {
      const values = GUIDES.map((g) => g[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it("beschrijvingen passen in een zoekresultaat en titels zijn niet te lang", () => {
    for (const g of GUIDES) {
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(70);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(170);
      expect(g.metaTitle.length, g.slug).toBeLessThanOrEqual(65);
    }
  });

  it("elke gids heeft een direct antwoord, uitleg, vragen, bronnen en interne links", () => {
    for (const g of GUIDES) {
      expect(g.answer.length, g.slug).toBeGreaterThan(80);
      expect(g.sections.length, g.slug).toBeGreaterThanOrEqual(2);
      expect(g.faq.length, g.slug).toBeGreaterThanOrEqual(1);
      expect(g.sources.length, g.slug).toBeGreaterThanOrEqual(1);
      for (const s of g.sources) expect(s.url, g.slug).toMatch(/^(https:\/\/|\/)/);
      expect(g.related.length, g.slug).toBeGreaterThanOrEqual(2);
      for (const r of g.related) {
        expect(r, g.slug).not.toBe(g.slug);
        expect(guideBySlug(r), `${g.slug} → ${r}`).not.toBeNull();
      }
      expect(g.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("geen nep-nauwkeurigheid of garanties", () => {
    for (const g of GUIDES) {
      const text = guideText(g);
      expect(text, g.slug).not.toMatch(/0 ?foutmarge|99[,.]\d+ ?%|100 ?% (nauwkeurig|accuraat|zeker)|gegarandeerd/i);
    }
  });

  it("raamdecoratie altijd in millimeters, nooit in cm of inch", () => {
    const raam = new Set<string>(GUIDE_INDEX.filter((g) => g.group === "raam").map((g) => g.slug));
    for (const g of GUIDES.filter((x) => raam.has(x.slug))) {
      const text = guideText(g);
      expect(text, g.slug).toMatch(/\bmm\b|millimeter/);
      expect(text, g.slug).not.toMatch(/\d\s?(cm|inch|")(?![a-z])/i);
    }
  });
});

describe("sitemap en robots", () => {
  it("de sitemap bevat alle publieke pagina's en geen persoonlijke", () => {
    vi.stubEnv("APP_URL", "https://voorbeeld.nl");
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://voorbeeld.nl");
    expect(urls).toContain("https://voorbeeld.nl/gidsen");
    expect(urls).toContain("https://voorbeeld.nl/hoe-we-meten");
    for (const g of GUIDES) expect(urls).toContain(`https://voorbeeld.nl/gidsen/${g.slug}`);
    expect(urls.some((u) => /\/(project|betaling|overdracht|api)\b/.test(u))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("robots houdt projecten, betalingen, overdrachten en de API buiten zoekmachines", () => {
    vi.stubEnv("APP_URL", "https://voorbeeld.nl");
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const disallow = rules.flatMap((x) => (Array.isArray(x.disallow) ? x.disallow : x.disallow ? [x.disallow] : []));
    expect(disallow).toEqual(expect.arrayContaining(["/project", "/betaling", "/overdracht", "/api/"]));
    expect(r.sitemap).toBe("https://voorbeeld.nl/sitemap.xml");
  });
});
