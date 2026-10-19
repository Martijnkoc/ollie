import { expect, test } from "@playwright/test";
import { fixture, newProject, step } from "./helpers";

test("makelaarsplattegrond met alleen kamernamen: opgemeten uit de wanden, alles wat klopt in één keer bevestigd", async ({ page }) => {
  test.setTimeout(180_000);
  await newProject(page);
  await step(page, /^Plattegrond/);
  await page.locator("input[type=file]").setInputFiles(fixture("plattegrond-wanden.png"));
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Kamers controleren" }).click();

  const summary = page.locator(".auto-summary");
  await expect(summary).toContainText("5 ruimtes opgemeten langs de wanden");
  await expect(summary).toContainText(/van de 13 maatlijnen op de tekening kloppen onderling/);
  await expect(summary).toContainText("Daarmee staat de schaal vast.");
  await expect(page.locator(".room-card")).toHaveCount(5);
  await expect(page.locator(".room-card").filter({ hasText: "Woonkamer" })).toContainText(/29,[34]\d m²/);

  await summary.getByRole("button", { name: "Bevestig alles wat klopt (5)" }).click();
  await expect(page.getByText("Alle meegetelde ruimtes gecontroleerd")).toBeVisible();
  await expect(page.getByText("Ik heb een maat nagemeten: schaal klopt")).toHaveCount(0);

  await page.getByRole("button", { name: "Bereken mijn vloer" }).click();
  await expect(page.locator(".metric").first()).toContainText(/48,[789]\d m²/);
});
