import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseAddress, newProject, step } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function serious(page: import("@playwright/test").Page) {
  // @axe-core/playwright ships its own playwright-core types; the runtime page object is the same.
  const result = await new AxeBuilder({ page: page as never }).withTags(TAGS).analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const path of ["/", "/privacy", "/voorwaarden", "/contact", "/project", "/gidsen", "/gidsen/laminaat-berekenen", "/hoe-we-meten"]) {
  test(`toegankelijkheid ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await serious(page)).toEqual([]);
  });
}

test("toegankelijkheid projectstappen", async ({ page }) => {
  await newProject(page);
  await chooseAddress(page);
  expect(await serious(page)).toEqual([]);
  for (const s of [/^Plattegrond/, /^Kamers/, /^Vloer/, /^Plinten & ramen/, /^Rapport/]) {
    await step(page, s);
    expect(await serious(page), String(s)).toEqual([]);
  }
});
