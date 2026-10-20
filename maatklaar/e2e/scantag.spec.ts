import { expect, test, type Page } from "@playwright/test";
import { installFakeWebXR } from "./fake-webxr";
import { capturePoints, newProject, OPENING_CORNERS, paidProjectWithWindow, scanOpening, step } from "./helpers";

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
  return page.getByRole("dialog", { name: "ScanTag: meten met je telefoon" });
}

test("ScanTag vóór betaling: AR-scan zonder papier, alleen een status, geen maat in scherm of netwerk; na betaling komen de maten vrij", async ({
  page,
}) => {
  await installFakeWebXR(page);
  const responses = recordScanResponses(page);
  const dialog = await startScan(page);
  await expect(dialog).not.toContainText(/A4|bankpas|printen|plakken/i);
  const opening = await scanOpening(page, dialog);
  await expect(opening).toContainText("1 scan · Gescand · niet geschikt om op te bestellen");
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
  // Before paying: what the report will hold for the windows, honestly, without sizes.
  const preview = page.getByRole("region", { name: "Wat je rapport bevat voor je ramen" });
  await expect(preview).toContainText("Bestelmaat mogelijk voor 0 van 1 raam");

  // Pay (DEMO): the server verifies the payment and releases the sizes of the existing scan.
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo/);
  await page.getByRole("button", { name: "Simuleer geslaagde betaling" }).click();
  await page.waitForURL(/#plinten-ramen$/);
  await expect(page.locator(".window-card").last()).toContainText("Met ScanTag gemeten: 6 maten");
  expect(responses.some((b) => JSON.parse(b).released === true && b.includes('"breedte_boven"'))).toBe(true);
});

test("na betaling: maten met foutmarge in hele mm, de rest met de hand, bevestigen; nooit een bestelmaat uit een ongevalideerde scan", async ({
  page,
}) => {
  await installFakeWebXR(page);
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog", { name: "ScanTag: meten met je telefoon" });
  const opening = await scanOpening(page, dialog);
  await expect(opening).toContainText(/Breedte boven: 1\d{3} mm ± \d+ mm/);
  const values = [...(await opening.innerText()).matchAll(/: (\d+) mm ± (\d+) mm/g)].map((m) => ({ mm: Number(m[1]), u: Number(m[2]) }));
  expect(values).toHaveLength(6);
  values.forEach((v, i) => {
    const truth = i < 3 ? 1200 : 1500;
    expect(Math.abs(v.mm - truth)).toBeLessThanOrEqual(2);
    expect(v.u).toBeGreaterThan(0);
  });
  await dialog.getByRole("button", { name: "Klaar" }).click();

  // On to what the scan did not measure (the depth), the questions and the confirmation.
  const wizard = page.getByRole("dialog", { name: "Raam meten" });
  await expect(wizard.getByLabel("Diepte van de dag")).toBeVisible();
  await wizard.getByLabel("Diepte van de dag").fill("95");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  for (const radio of await wizard.getByRole("radio", { name: "Nee" }).all()) await radio.check();
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await expect(wizard.getByRole("row", { name: /Breedte boven/ })).toContainText("(ScanTag)");
  await wizard.getByLabel(/Ik heb alle maten van dit raam nagekeken/).check();
  await wizard.getByRole("button", { name: "Klaar" }).click();

  const card = page.locator(".window-card").last();
  await expect(card).toContainText("Door jou bevestigd");
  await expect(card).toContainText("Met ScanTag gemeten: 6 maten");
  await expect(card).toContainText("Bestelmaat: volgens je leverancier.");
  await expect(card).not.toContainText(/cm\b/);
});

test("een hoek op het glas: opnieuw scannen, met de reden", async ({ page }) => {
  await installFakeWebXR(page);
  const dialog = await startScan(page);
  const opening = dialog.locator(".task-list > li").filter({ hasText: "Raamopening" });
  await opening.getByRole("button", { name: "Scannen" }).click();
  await dialog.getByRole("button", { name: "Start de scan" }).click();
  // The third corner lands on the glass, 80 mm behind the wall face.
  await capturePoints(page, [OPENING_CORNERS[0], OPENING_CORNERS[1], [1200, 1500, -80], OPENING_CORNERS[3]]);
  await expect(opening).toContainText("1 scan · Opnieuw scannen");
  await expect(opening).toContainText("De hoeken liggen niet in één vlak");
});

test("zonder AR-tracking in de browser: eerlijk niet ondersteund, en verder via een telefoon die het kan", async ({ page }) => {
  const dialog = await startScan(page);
  await expect(dialog.getByText("Automatisch inmeten kan niet op dit toestel")).toBeVisible();
  await expect(dialog).toContainText("we maken van pixels geen millimeters");
  await expect(dialog.getByRole("button", { name: "Scannen", exact: true }).first()).toBeDisabled();
  await dialog.getByRole("button", { name: "Verder op een telefoon die kan scannen" }).click();
  await expect(page.getByRole("dialog", { name: "Scannen met je telefoon" })).toBeVisible();
});

test("camera geweigerd: duidelijke uitleg", async ({ page }) => {
  await installFakeWebXR(page, { deny: true });
  const dialog = await startScan(page);
  await dialog.locator(".task-list > li").first().getByRole("button", { name: "Scannen" }).click();
  await dialog.getByRole("button", { name: "Start de scan" }).click();
  await expect(dialog.getByRole("alert")).toContainText("geen toestemming gegeven voor de camera");
});

test("ScanTag zonder verbinding: de scan blijft bewaard en wordt gecontroleerd zodra je weer online bent", async ({ page, context }) => {
  await installFakeWebXR(page);
  const dialog = await startScan(page);
  await context.setOffline(true);
  const opening = await scanOpening(page, dialog);
  await expect(opening).toContainText("1 scan · Bewaard; wordt gecontroleerd zodra je online bent");
  await context.setOffline(false);
  await expect(opening).toContainText("1 scan · Gescand · niet geschikt om op te bestellen");
});
