import { expect, test, type Page } from "@playwright/test";

async function jsonLdTypes(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const data = JSON.parse(b) as { "@type"?: string } | { "@type"?: string }[];
    return (Array.isArray(data) ? data : [data]).map((d) => d["@type"]);
  });
}

test("gids: eigen canonical, titel, structured data en interne links", async ({ page }) => {
  await page.goto("/gidsen/laminaat-berekenen");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Laminaat");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/gidsen\/laminaat-berekenen$/);
  await expect(page).toHaveTitle(/Metrivo/);
  expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(["Article", "BreadcrumbList", "FAQPage"]));
  // Related guides and the methodology are linked, so every page is reachable without the sitemap.
  await expect(page.locator('main a[href^="/gidsen/"]').first()).toBeVisible();
  await expect(page.locator('a[href="/hoe-we-meten"]').first()).toBeAttached();
});

test("gidsenoverzicht en methode zijn indexeerbaar met canonical", async ({ page }) => {
  for (const path of ["/", "/gidsen", "/hoe-we-meten"]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute("href", new RegExp(`${path === "/" ? "" : path}/?$`));
    await expect(page.locator('meta[name="robots"]'), path).not.toHaveAttribute("content", /noindex/);
  }
});

test("delen: elke publieke pagina heeft eigen Open Graph- en Twitter-teksten en een afbeelding", async ({ page }) => {
  for (const [path, title] of [
    ["/gidsen/laminaat-berekenen", /Laminaat/],
    ["/gidsen", /Gidsen/],
    ["/hoe-we-meten", /Hoe we meten/],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute("content", title);
    await expect(page.locator('meta[name="twitter:title"]'), path).toHaveAttribute("content", title);
    await expect(page.locator('meta[property="og:url"]'), path).toHaveAttribute("content", new RegExp(`${path}$`));
    await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute("content", /\/opengraph-image/);
  }
});

test("onbekende gids geeft 404", async ({ page }) => {
  const res = await page.goto("/gidsen/bestaat-niet");
  expect(res?.status()).toBe(404);
});

test("projecten en overdrachten staan op noindex", async ({ page }) => {
  for (const path of ["/project", "/project/nieuw", "/overdracht"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
  }
});

test("robots.txt en sitemap.xml", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /project");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/gidsen/plisse-meten</loc>");
  expect(sitemap).not.toContain("/project");
});
