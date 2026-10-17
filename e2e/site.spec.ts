import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "../playwright.config";

test.describe("homepage and live board", () => {
  test("shows today's matches, clearly labelled as demo data, with working filters", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note").filter({ hasText: "DEMO-OMGEVING" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Vandaag" })).toBeVisible();
    await expect(page.getByText(/Laatste synchronisatie met de databron: \d{2}:\d{2}:\d{2}/)).toBeVisible();
    const rows = page.locator("#board-list .match-row");
    const total = await rows.count();
    expect(total).toBeGreaterThan(5);

    // The demo schedule always has a match in play; the live filter shows only those.
    await page.getByRole("button", { name: /^Live/ }).click();
    await expect(page.locator("#board-list .match-row.is-live").first()).toBeVisible();
    expect(await rows.count()).toBe(await page.locator("#board-list .match-row.is-live").count());

    await page.getByRole("button", { name: /^Alle/ }).click();
    await page
      .getByRole("group", { name: "Filter op competitie" })
      .getByRole("button", { name: /Premier League/ })
      .click();
    await expect(page.locator("#board-list section.group")).toHaveCount(1);
    await expect(page.locator("#board-list section.group h2")).toHaveText("Premier League");
  });

  test("navigates between days with stable URLs and marks day pages noindex", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Volgende dag/ }).click();
    await expect(page).toHaveURL(/\/wedstrijden\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Morgen" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("shows an offline notice instead of pretending scores are current", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.getByText("Je bent offline.")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("Je bent offline.")).toBeHidden();
  });
});

test.describe("favourites and search", () => {
  test("a starred competition persists in this browser and appears on the favourites page", async ({ page }) => {
    await page.goto("/");
    const star = page.getByRole("button", { name: "Eredivisie toevoegen aan favorieten" }).first();
    await star.click();
    await expect(page.getByRole("button", { name: "Eredivisie verwijderen uit favorieten" }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.reload();
    await expect(page.getByRole("button", { name: "Eredivisie verwijderen uit favorieten" }).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Hoofdmenu" }).getByRole("link", { name: "Favorieten" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Favorieten" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Eredivisie" }).last()).toBeVisible();
    await expect(page.locator(".match-row").first()).toBeVisible();
  });

  test("finds a club with the keyboard and opens its page", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Zoek een club of competitie" });
    await box.fill("polder");
    await expect(page.getByRole("option", { name: /FC Polderstad/ })).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(/\/team\/fc-polderstad-\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: "FC Polderstad" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recente uitslagen" })).toBeVisible();
  });
});

test.describe("competition, team and match pages", () => {
  test("competition tabs show programme, results and the provider's standings", async ({ page }) => {
    await page.goto("/competitie/eredivisie");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Eredivisie");
    await page.getByRole("navigation", { name: "Onderdelen" }).getByRole("link", { name: "Stand" }).click();
    await expect(page).toHaveURL(/\/competitie\/eredivisie\/stand$/);
    await expect(page.locator("table.standings tbody tr")).toHaveCount(10);
    await page.getByRole("navigation", { name: "Onderdelen" }).getByRole("link", { name: "Uitslagen" }).click();
    await expect(page.getByRole("heading", { name: /Speelronde \d+/ }).first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/competitie\/eredivisie\/uitslagen$/);
  });

  test("a finished match shows score, events, statistics, line-ups and honest AI status", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Afgelopen/ }).click();
    const first = page.locator("#board-list .match-row:not(.is-off) .row-link").first();
    await first.click();
    await expect(page).toHaveURL(/\/wedstrijd\/[a-z0-9-]+-\d+$/);
    await expect(page.getByLabel("Wedstrijdstand")).toContainText(/Afgelopen|Gestaakt/);
    await expect(page.getByText(/Laatst bevestigd door de databron om \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Statistieken" })).toBeVisible();
    await expect(page.getByText("Balbezit")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Opstellingen" })).toBeVisible();
    await expect(page.getByText("AI-analyses zijn nog niet geconfigureerd op deze site.")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(new URL(page.url()).pathname + "$"));
  });

  test("a postponed match never shows a score", async ({ page, request }) => {
    let found: string | null = null;
    for (let d = -10; d <= 10 && !found; d++) {
      const day = new Date(Date.now() + d * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
      const data = (await (await request.get(`/api/v1/day/${day}`)).json()) as {
        matches: { path: string; status: string; score: { home: number | null } }[];
      };
      const postponed = data.matches.find((m) => m.status === "postponed");
      if (postponed) {
        expect(postponed.score.home).toBeNull();
        found = postponed.path;
      }
    }
    expect(found).not.toBeNull();
    await page.goto(found!);
    await expect(page.getByLabel("Wedstrijdstand")).toContainText("Uitgesteld");
    await expect(page.getByText("Nog geen stand")).toBeAttached();
    await expect(page.getByText("er is geen geldige eindstand")).toBeVisible();
  });
});

test.describe("HTTP behaviour, SEO and protection", () => {
  test("returns real status codes and canonical redirects", async ({ request }) => {
    expect((await request.get("/team/bestaat-niet-999999")).status()).toBe(404);
    expect((await request.get("/competitie/onbekend")).status()).toBe(404);
    expect((await request.get("/wedstrijden/1990-01-01")).status()).toBe(404);
    const day = (await (
      await request.get(`/api/v1/day/${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" })}`)
    ).json()) as { matches: { id: number; path: string }[] };
    const m = day.matches[0];
    const res = await request.get(`/wedstrijd/verkeerde-naam-${m.id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(m.path);
  });

  test("keeps the demo environment out of search engines", async ({ request, page }) => {
    expect(await (await request.get("/robots.txt")).text()).toMatch(/Disallow: \//);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("<url>");
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });

  test("caches the live JSON briefly at the edge and sends security headers", async ({ request }) => {
    const res = await request.get(`/api/v1/day/${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" })}`);
    expect(res.headers()["cache-control"]).toMatch(/s-maxage=15/);
    const html = await request.get("/");
    expect(html.headers()["x-frame-options"]).toBe("DENY");
    expect(html.headers()["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  });

  test("protects the cron endpoint and the admin area", async ({ request, browser }) => {
    expect((await request.get("/api/cron/sync")).status()).toBe(401);
    expect((await request.get("/beheer")).status()).toBe(401);
    expect((await request.post("/api/admin/sync", { data: {} })).status()).toBe(401);
    const ctx = await browser.newContext({ httpCredentials: E2E_ADMIN });
    const page = await ctx.newPage();
    await page.goto("/beheer");
    await expect(page.getByRole("heading", { level: 1, name: "Beheer" })).toBeVisible();
    await expect(page.getByText("ingesteld")).toBeVisible();
    await page.getByLabel("Taak", { exact: true }).selectOption("live");
    await page.getByLabel(/Nu uitvoeren/).check();
    await page.getByRole("button", { name: "Synchroniseren" }).click();
    await expect(page.getByText(/success · live/)).toBeVisible();
    await ctx.close();
  });
});
