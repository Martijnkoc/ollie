import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

async function pagesToCheck(request: import("@playwright/test").APIRequestContext) {
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const data = (await (await request.get(`/api/v1/day/${day}`)).json()) as {
    matches: { path: string; home: { id: number; slug: string } }[];
  };
  const m = data.matches[0];
  return [
    "/",
    "/competities",
    "/competitie/eredivisie",
    "/competitie/eredivisie/stand",
    m.path,
    `/team/${m.home.slug}-${m.home.id}`,
    "/favorieten",
    "/over",
    "/status",
  ];
}

test("no horizontal overflow at common desktop sizes", async ({ page, request }) => {
  const paths = await pagesToCheck(request);
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const path of paths) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${size.width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test("automated accessibility checks find no serious or critical issues", async ({ page, request }) => {
  for (const path of await pagesToCheck(request)) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }
});

test("keyboard users can skip to the content and see focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Naar de inhoud" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#inhoud")).toBeFocused();
});
