import { expect, test } from "@playwright/test";
import { clickPlan, fixture, newProject, step } from "./helpers";

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

  // Split the L-shaped woonkamer where the side part starts, then join it again.
  const size = { width: 1360, height: 1640 };
  const active = page.locator(".room-card[data-active=true]");
  await page
    .locator(".room-card")
    .filter({ has: page.getByRole("heading", { name: "Woonkamer" }) })
    .getByRole("button", { name: /Controleren|Bewerken/ })
    .click();
  await active.getByRole("button", { name: "Splitsen" }).click();
  await clickPlan(page, size, 340, 770);
  await clickPlan(page, size, 460, 770);
  await expect(page.locator(".room-card")).toHaveCount(6);
  await expect(page.locator(".room-card").filter({ has: page.getByRole("heading", { name: "Woonkamer (deel 2)" }) })).toContainText(
    /5,4\d m²/,
  );
  await expect(active.locator(".room-area")).toHaveText(/2[34],\d\d m²/);

  // A wall between two rooms: joining them is refused instead of counting the wall as floor.
  await page
    .locator(".room-card")
    .filter({ has: page.getByRole("heading", { name: "Keuken" }) })
    .getByRole("button", { name: /Controleren|Bewerken/ })
    .click();
  await active.getByLabel(/samenvoegen met/).selectOption({ label: "1. Woonkamer" });
  await expect(page.getByRole("alert").filter({ hasText: "er staat een wand tussen" })).toBeVisible();

  await page
    .locator(".room-card")
    .filter({ has: page.getByRole("heading", { name: "Woonkamer (deel 2)" }) })
    .getByRole("button", { name: /Controleren|Bewerken/ })
    .click();
  await active.getByLabel(/samenvoegen met/).selectOption({ label: "1. Woonkamer" });
  await expect(page.locator(".room-card")).toHaveCount(5);
  await expect(page.locator(".room-card").first().locator(".room-area")).toHaveText(/29,[34]\d m²/);

  await page.getByRole("button", { name: "Bereken mijn vloer" }).click();
  await expect(page.locator(".metric").first()).toContainText(/48,[789]\d m²/);
});
