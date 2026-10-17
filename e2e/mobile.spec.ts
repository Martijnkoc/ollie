import { expect, test } from "@playwright/test";

test("works on a phone without horizontal scrolling", async ({ page, request }) => {
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const data = (await (await request.get(`/api/v1/day/${day}`)).json()) as { matches: { path: string }[] };
  for (const path of ["/", "/competitie/eredivisie/stand", data.matches[0].path, "/competities"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Zoek een club of competitie" })).toBeVisible();
  await page.locator("#board-list .row-link").first().click();
  await expect(page.getByLabel("Wedstrijdstand")).toBeVisible();
});
