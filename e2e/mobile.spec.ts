import { expect, test } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

test("on a phone: no horizontal scroll, a thumb-height tab bar, and keyboard access to the login", async ({ page }) => {
  for (const path of ["/", "/ontdek", "/hoe-het-werkt", "/inloggen", "/voorwaarden"]) {
    await page.goto(path);
    expect(await noHorizontalScroll(page), path).toBe(true);
  }
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Snelmenu" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hoofdmenu" })).toBeHidden();
  await page.getByRole("navigation", { name: "Snelmenu" }).getByRole("link", { name: "Ontdek" }).click();
  await expect(page).toHaveURL("/ontdek");

  await page.goto("/inloggen");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Naar de inhoud" })).toBeFocused();
  await page.getByLabel("E-mailadres").fill("mobiel@e2e.test");
  await page.getByRole("button", { name: "Stuur mij een code" }).click();
  await expect(page.getByLabel("Code uit de e-mail")).toBeFocused();
});
