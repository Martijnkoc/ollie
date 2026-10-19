import { expect, test } from "@playwright/test";
import { clickPlan, fixture, newProject, step } from "./helpers";

test("adres: geen resultaat, druk en time-out geven een nette melding", async ({ page }) => {
  await newProject(page);
  const field = page.getByLabel("Adres", { exact: true });
  await field.fill("bestaatniet 999");
  await expect(page.getByText(/Geen adres gevonden/)).toBeVisible();
  await field.fill("drukte 1");
  await expect(page.getByText(/te veel zoekopdrachten/)).toBeVisible();
  await field.fill("traag 1");
  await expect(page.getByText(/PDOK reageert nu niet op tijd/)).toBeVisible({ timeout: 10_000 });
  // Without an address the flow continues.
  await page.getByRole("button", { name: "Zonder adres verder" }).click();
  await expect(page.getByRole("heading", { name: "Voeg je plattegrond toe" })).toBeVisible();
});

test("upload: kapotte, valse en te grote bestanden worden begrijpelijk geweigerd", async ({ page }) => {
  await newProject(page);
  await step(page, /^Plattegrond/);
  const input = page.locator("input[type=file]");
  await input.setInputFiles(fixture("nep-afbeelding.png"));
  // (Next.js also renders a route announcer with role=alert; look at our error notice.)
  await expect(page.getByRole("alert").filter({ hasText: "Dit is geen PDF, JPG, PNG of WEBP" })).toBeVisible();
  await input.setInputFiles(fixture("kapot.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: "Deze PDF kunnen we niet openen" })).toBeVisible();
  const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(21 * 1024 * 1024, 0x20)]);
  await input.setInputFiles({ name: "groot.pdf", mimeType: "application/pdf", buffer: big });
  await expect(page.getByRole("alert").filter({ hasText: "groter dan 20 MB" })).toBeVisible();
});

test("zonder schaal: kalibreren met een bekende maat, dan een kamer tekenen", async ({ page }) => {
  await newProject(page);
  await step(page, /^Plattegrond/);
  await page.locator("input[type=file]").setInputFiles(fixture("zonder-schaal.pdf"));
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/niet op schaal/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Kamers controleren" }).click();
  await expect(page.locator(".plan-inner img")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Zonder schaal kunnen we getekende ruimtes niet omrekenen/)).toBeVisible();

  // Recognised rooms without measurements have no area: nothing is invented.
  await expect(page.locator(".room-card").first()).toContainText("—");

  // The fixture page is 600 × 450 pt; its outer wall runs from (60, 80) to (460, 80) and is 8,00 m.
  const size = { width: 600, height: 450 };
  await page.getByRole("button", { name: "Kalibreer met een bekende maat" }).click();
  await clickPlan(page, size, 60, 80);
  await clickPlan(page, size, 460, 80);
  await page.getByLabel("Hoe lang is deze lijn in werkelijkheid?").fill("8,00");
  await page.getByRole("button", { name: "Schaal opslaan" }).click();
  await expect(page.getByText("Gekalibreerd op een lijn van 8,00 m.")).toBeVisible();

  // Draw the woonkamer (5,00 × 6,00 m) on the first recognised room.
  await page.getByRole("button", { name: "Controleren" }).first().click();
  await page.getByRole("button", { name: "Teken op de plattegrond" }).click();
  for (const [x, y] of [
    [60, 80],
    [310, 80],
    [310, 380],
    [60, 380],
  ]) {
    await clickPlan(page, size, x!, y!);
  }
  await page.getByRole("button", { name: /^Klaar/ }).click();
  await expect(page.locator(".room-card[data-active=true] .room-area")).toHaveText("30,00 m²");
});

test("gescande afbeelding: lokale OCR in de browser vindt kamers en maten", async ({ page }) => {
  await newProject(page);
  await step(page, /^Plattegrond/);
  await page.locator("input[type=file]").setInputFiles(fixture("scan-helder.png"));
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Gelezen met OCR", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Kamers controleren" }).click();
  await expect(page.locator(".room-card").filter({ hasText: "Keuken" })).toContainText("12,00 m²");
  // An image has no physical paper size: no scale is assumed.
  await expect(page.getByText(/Zonder schaal kunnen we getekende ruimtes niet omrekenen/)).toBeVisible();
});
