import { expect, test } from "@playwright/test";
import { newProject, step } from "./helpers";

const MOLLIE = "http://localhost:3101";

test("een redirect met status=paid geeft niets vrij zonder verificatie bij de provider", async ({ page }) => {
  await newProject(page);
  await step(page, /^Plinten & ramen/);
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo\?order=(ord_[a-z0-9]+)/);
  const orderId = new URL(page.url()).searchParams.get("order")!;

  // Skip the checkout and fake the return, as an attacker or a broken redirect would.
  await page.goto(`/betaling/terug?order=${orderId}&status=paid&paid=true`);
  await expect(page.getByRole("heading", { name: "Je betaling is nog niet bevestigd" })).toBeVisible({ timeout: 40_000 });
  await page.getByRole("link", { name: "Terug naar mijn project" }).click();
  await expect(page.getByRole("button", { name: /Betaal € 8,99/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plinten", exact: true })).toHaveCount(0);
});

test("zonder ordergeheim geen status, en de demo-simulatie vraagt het geheim", async ({ request }) => {
  const status = await request.get("/api/bestellingen/ord_000000000000000000000000");
  expect(status.status()).toBe(404);
  const demo = await request.post("/api/demo/betalingen", {
    data: { orderId: "ord_000000000000000000000000", secret: "x", outcome: "paid" },
    headers: { origin: "http://localhost:3100" },
  });
  expect(demo.status()).toBe(404);
});

test("echte Mollie-adapter: checkout op een ander domein, terugkeer, project blijft bewaard en wordt ontgrendeld", async ({ page }) => {
  await newProject(page, MOLLIE);
  await page.getByLabel("Projectnaam").fill("Mollie-testwoning");
  await step(page, /^Plinten & ramen/);
  await expect(page.getByText(/Testmodus: Mollie-testbetaling/)).toBeVisible();
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  // The Mollie test double lives on another origin, like the real checkout.
  await page.waitForURL(/localhost:3201\/mollie\/checkout\/tr_/);
  await page.getByRole("button", { name: "Testbetaling voltooien" }).click();
  await page.waitForURL(/localhost:3101\/betaling\/terug\?order=ord_/);
  await expect(page.getByRole("heading", { name: "Betaling ontvangen" })).toBeVisible();
  await page.waitForURL(/#plinten-ramen$/);
  await expect(page.getByRole("heading", { name: "Plinten", exact: true })).toBeVisible();
  await expect(page.getByLabel("Projectnaam")).toHaveValue("Mollie-testwoning");
  await expect(page.getByText(/DEMO-modus/)).toHaveCount(0);
});

test("geannuleerde Mollie-betaling ontgrendelt niets", async ({ page }) => {
  await newProject(page, MOLLIE);
  await step(page, /^Plinten & ramen/);
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/localhost:3201\/mollie\/checkout\/tr_/);
  await page.getByRole("button", { name: "Annuleren" }).click();
  await expect(page.getByRole("heading", { name: "Niet betaald" })).toBeVisible();
  await expect(page.getByText("Je hebt de betaling geannuleerd.")).toBeVisible();
});

test("Mollie-webhook: alleen een geldig id, onbekende ids worden zonder details erkend", async ({ request }) => {
  expect((await request.post(`${MOLLIE}/api/betalingen/mollie`, { form: { id: "geen-id" } })).status()).toBe(400);
  expect((await request.post(`${MOLLIE}/api/betalingen/mollie`, { form: { id: "tr_onbekend123" } })).status()).toBe(200);
  // On the DEMO server the Mollie webhook does not exist.
  expect((await request.post(`/api/betalingen/mollie`, { form: { id: "tr_onbekend123" } })).status()).toBe(404);
});

test("bestelling vanaf een ander domein wordt geweigerd", async ({ request }) => {
  const res = await request.post("/api/bestellingen", {
    data: { projectRef: "abcdefghijkmnpqrstuvw" },
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  expect(res.status()).toBe(403);
});
