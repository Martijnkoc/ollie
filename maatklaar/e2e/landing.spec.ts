import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

test("landingpage: prijs en privacy zichtbaar, demo rekent mee", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Van plattegrond naar complete bestellijst." })).toBeVisible();
  await expect(page.getByText("Basis gratis · Compleet rapport € 8,99 eenmalig · Geen abonnement")).toBeVisible();
  await expect(page.getByText(/blijft op je apparaat/).first()).toBeVisible();
  // The demo is labelled as a demonstration and its total follows the selection.
  const demo = page.locator(".demo-interactive");
  await expect(demo).toContainText("Demonstratie · fictieve woning");
  const before = await demo.locator(".demo-list").innerText();
  await demo.getByRole("checkbox", { name: "Badkamer" }).check();
  await expect(demo.locator(".demo-list")).not.toHaveText(before);
});

test("landingpage: adres kiezen opent een project dat de gegevens echt ophaalt", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Adres van de woning").fill("voorbeeld");
  await page.getByRole("option", { name: /Voorbeeldstraat 12/ }).click();
  await page.waitForURL(/\/project\/[a-z0-9]{12,}$/);
  await expect(page.getByText("Klaar om je plattegrond toe te voegen")).toBeVisible();
  await expect(page.getByText("86,00 m²")).toBeVisible();
});

test("landingpage: plattegrond neerzetten start meteen de analyse", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/");
  await page.locator(".hero-drop input[type=file]").setInputFiles(fixture("plattegrond-wanden.png"));
  await page.waitForURL(/\/project\/[a-z0-9]{12,}#plattegrond$/);
  await expect(page.getByRole("heading", { name: "Wat we vonden" })).toBeVisible({ timeout: 120_000 });
});
