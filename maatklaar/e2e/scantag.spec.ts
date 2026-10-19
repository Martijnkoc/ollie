import { expect, test, type Page } from "@playwright/test";
import { newProject, scanOpening, step } from "./helpers";

/** Everything the browser receives from /api/scantag, to prove no size leaves the server before payment. */
function recordScanResponses(page: Page) {
  const bodies: string[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/scantag")) bodies.push(await res.text().catch(() => ""));
  });
  return bodies;
}

async function startScan(page: Page) {
  await newProject(page);
  await step(page, /Plinten & ramen/);
  await expect(page.getByRole("heading", { name: "ScanTag: scan je ramen alvast" })).toBeVisible();
  await page.getByRole("button", { name: "+ Raam toevoegen" }).click();
  await page.locator(".window-card").last().getByRole("button", { name: "Scannen met ScanTag" }).click();
  return page.getByRole("dialog", { name: "ScanTag: meten met je camera" });
}

test("ScanTag vóór betaling: alleen een status, geen maat in scherm of netwerk; na betaling komen de maten vrij", async ({ page }) => {
  const responses = recordScanResponses(page);
  const dialog = await startScan(page);
  const opening = await scanOpening(page, dialog);
  await expect(dialog.getByText("Bij opslaan controleren we of de scan bruikbaar is", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Gemeten in deze foto")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Scan opslaan" }).click();
  await expect(opening).toContainText("1 foto · Scan verwerkt");
  await expect(opening).toContainText("De maten uit deze scan zie je na het ontgrendelen");

  // No size anywhere: not on the page, not in any server response.
  expect(await page.locator("body").innerText()).not.toMatch(/\b1\.?[12]\d\d mm\b|± \d+ mm/);
  expect(responses.length).toBeGreaterThan(0);
  for (const body of responses) {
    expect(JSON.parse(body).released).toBe(false);
    expect(body).not.toContain("values");
    expect(body).not.toMatch(/"mm"/);
  }
  await dialog.getByRole("button", { name: "Klaar" }).click();
  const card = page.locator(".window-card").last();
  await expect(card).toContainText("ScanTag: Nog 1 opname");
  await expect(page.getByText("1 raam · 0 gescand")).toBeVisible();

  // Pay (DEMO): the server verifies the payment and releases the sizes of the existing scan.
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo/);
  await page.getByRole("button", { name: "Simuleer geslaagde betaling" }).click();
  await page.waitForURL(/#plinten-ramen$/);
  await expect(page.locator(".window-card").last()).toContainText("Met ScanTag gemeten: 6 maten");
  expect(responses.some((b) => JSON.parse(b).released === true && b.includes('"breedte_boven"'))).toBe(true);
});

test("ScanTag zonder verbinding: de scan blijft bewaard en wordt later verwerkt", async ({ page }) => {
  const dialog = await startScan(page);
  await page.route("**/api/scantag", (route) => route.abort("internetdisconnected"));
  const opening = await scanOpening(page, dialog);
  await dialog.getByRole("button", { name: "Scan opslaan" }).click();
  await expect(dialog.getByText("Geen verbinding met MaatKlaar: je scan is op dit apparaat bewaard.")).toBeVisible();
  await expect(opening).toContainText("1 foto · Wacht op verwerking");

  await page.unroute("**/api/scantag");
  await opening.getByRole("button", { name: "Nu verwerken" }).click();
  await expect(opening).toContainText("1 foto · Scan verwerkt");
});
