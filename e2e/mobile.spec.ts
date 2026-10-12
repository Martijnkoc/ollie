import { expect, test } from "@playwright/test";

test("the landing page and login work on a phone without horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Eerst een klik.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.goto("/inloggen");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Naar de inhoud" })).toBeFocused();
  await page.getByLabel("E-mailadres").fill("mobiel@e2e.test");
  await page.getByRole("button", { name: "Stuur mij een code" }).click();
  await expect(page.getByLabel("Code uit de e-mail")).toBeFocused();
});
