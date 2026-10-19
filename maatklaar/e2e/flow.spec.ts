import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { chooseAddress, confirmAllRooms, fixture, newProject, step } from "./helpers";

test("van adres tot rapport: gratis vloer, DEMO-betaling, plinten, raammeting, PDF en CSV", async ({ page }) => {
  await newProject(page);

  // Address with real (mocked) progress steps and BAG data, clearly labelled.
  await chooseAddress(page);
  await expect(page.getByText("Gebruiksoppervlakte (BAG)")).toBeVisible();
  await expect(page.getByText("86,00 m²")).toBeVisible();
  await expect(page.getByText(/bepaalt dus niet de oppervlakte van je kamers/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Contour van het gebouw/ })).toBeVisible();

  // Upload and local analysis of a vector PDF.
  await step(page, /^Plattegrond/);
  await page.locator("input[type=file]").setInputFiles(fixture("appartement.pdf"));
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("9 mogelijke ruimtes gevonden.")).toBeVisible();
  await expect(page.getByText("Schaalnotatie Schaal 1:50 gevonden.")).toBeVisible();

  // Rooms: suggestions are unconfirmed until the user confirms them.
  await page.getByRole("button", { name: "Kamers controleren" }).click();
  await expect(page.locator(".plan-inner img")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Nog niet alles gecontroleerd")).toBeVisible();
  await page.getByRole("button", { name: "Ik heb een maat nagemeten: schaal klopt" }).click();
  await confirmAllRooms(page);
  await expect(page.getByText("Alle meegetelde ruimtes gecontroleerd")).toBeVisible();

  // Free floor result, live (de)selection, packs only with a pack size.
  await page.getByRole("button", { name: "Bereken mijn vloer" }).click();
  await expect(page.locator(".metric").first()).toContainText("96,00 m²");
  await page.getByRole("checkbox", { name: /Badkamer/ }).uncheck();
  await expect(page.locator(".metric").first()).toContainText("90,00 m²");
  await expect(page.locator(".metric.primary")).toContainText("96,30 m²"); // 90 × 1,07
  await expect(page.locator(".metric").nth(2)).toContainText("—");
  await page.getByLabel("Inhoud per pak (optioneel)").fill("2,131");
  await page.getByLabel("Inhoud per pak (optioneel)").blur();
  await expect(page.locator(".metric").nth(2)).toContainText("46"); // 96,30 / 2,131 = 45,19 → 46
  await expect(page.getByText(/Wil je ook plinten en raamdecoratie/)).toBeVisible();

  // Paid step: locked until a verified (DEMO) payment.
  await page.getByRole("button", { name: "Bekijk wat je krijgt" }).click();
  await expect(page.getByText(/DEMO-modus: je doorloopt een nagebootste betaling/)).toBeVisible();
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo/);
  await expect(page.getByText(/dit is geen echte betaalpagina/)).toBeVisible();
  await page.getByRole("button", { name: "Simuleer geslaagde betaling" }).click();
  await expect(page.getByRole("heading", { name: "Betaling ontvangen" })).toBeVisible();
  await page.waitForURL(/#plinten-ramen$/);
  await expect(page.getByText(/DEMO-modus: er is niet echt betaald/)).toBeVisible();

  // Plinths: the L-shaped woonkamer has only an area, so plinths stay incomplete instead of guessed.
  await expect(page.getByRole("heading", { name: "Plinten", exact: true })).toBeVisible();
  await expect(page.getByText("Onvolledig: Woonkamer", { exact: true })).toBeVisible();

  // Window register and guided measuring with a deviation that is not averaged away.
  await page.getByRole("button", { name: "+ Raam toevoegen" }).click();
  await page.getByLabel("Product").selectOption("rolgordijn");
  await page.getByLabel("Montage").selectOption("in-de-dag");
  await page.getByRole("button", { name: "Meten" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Volgende" }).click();
  for (const v of ["1203", "1201", "1195"]) {
    await dialog.getByRole("textbox").fill(v);
    await dialog.getByRole("button", { name: "Volgende" }).click();
  }
  await expect(dialog.getByText(/verschil 8 mm/)).toBeVisible();
  await expect(dialog.getByText(/We\s+kiezen niet zelf een gemiddelde/)).toBeVisible();
  await dialog.getByLabel("Ik heb opnieuw gemeten en het verschil klopt").check();
  await dialog.getByRole("button", { name: "Volgende" }).click();
  for (const v of ["1500", "1499", "1501"]) {
    await dialog.getByRole("textbox").fill(v);
    await dialog.getByRole("button", { name: "Volgende" }).click();
  }
  await dialog.getByRole("button", { name: "Volgende" }).click(); // hoogte binnen drempel
  await dialog.getByRole("textbox").fill("60");
  await dialog.getByRole("button", { name: "Volgende" }).click();
  for (const radio of await dialog.getByRole("radio", { name: "Nee" }).all()) await radio.check();
  await dialog.getByRole("button", { name: "Volgende" }).click();
  await expect(dialog.getByText("Meetblad met ruwe maten.")).toBeVisible();
  await dialog.getByLabel(/Ik heb alle maten van dit raam nagekeken/).check();
  await expect(dialog.getByText("Door jou bevestigd")).toBeVisible();
  await dialog.getByRole("button", { name: "Klaar" }).click();
  await expect(page.locator(".window-card")).toContainText("Bestelmaat: volgens je leverancier.");

  // Report: PDF and CSV made in the browser.
  await page.getByRole("button", { name: "Naar mijn rapport" }).click();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF-rapport" }).click()]);
  const pdfBytes = readFileSync((await pdf.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.suggestedFilename()).toMatch(/^maatklaar-.*\.pdf$/);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV-bestellijst" }).click()]);
  const csvText = readFileSync((await csv.path())!, "utf8");
  expect(csvText).toContain("DEMO - niet betaald");
  expect(csvText).toContain("Breedte onder;1195;mm");

  // The project survives a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Download PDF-rapport" })).toBeVisible();
});
