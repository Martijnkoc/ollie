import { expect, test, type Page } from "@playwright/test";
import { chooseAddress, fixture, newProject, step } from "./helpers";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("landingpage op een telefoon: geen horizontale scroll, vaste CTA, skiplink", async ({ page }) => {
  await page.goto("/");
  await noHorizontalScroll(page);
  await expect(page.locator(".mobile-cta")).toBeVisible();
  await expect(page.locator(".mobile-cta").getByRole("link", { name: "Starten" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Naar de inhoud" })).toBeFocused();
});

test("projectflow op een telefoon past op het scherm", async ({ page }) => {
  await newProject(page);
  await noHorizontalScroll(page);
  await chooseAddress(page);
  await noHorizontalScroll(page);
  await step(page, /^Plattegrond/);
  await page.locator("input[type=file]").setInputFiles(fixture("appartement.pdf"));
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Kamers controleren" }).click();
  await expect(page.locator(".plan-inner img")).toBeVisible({ timeout: 30_000 });
  await noHorizontalScroll(page);
  await step(page, /^Vloer/);
  await noHorizontalScroll(page);
  await step(page, /^Plinten & ramen/);
  await noHorizontalScroll(page);
});
