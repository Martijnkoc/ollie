import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

export const fixture = (name: string) => path.resolve(import.meta.dirname, "../fixtures", name);

export async function newProject(page: Page, base = "") {
  await page.goto(`${base}/project/nieuw`);
  await page.waitForURL(/\/project\/[a-z0-9]{12,}$/);
  await expect(page.getByRole("heading", { name: "Om welke woning gaat het?" })).toBeVisible();
}

export async function chooseAddress(page: Page) {
  await page.getByLabel("Adres", { exact: true }).fill("voorbeeld");
  await page.getByRole("option", { name: /Voorbeeldstraat 12/ }).click();
  await expect(page.getByText("Klaar om je plattegrond toe te voegen")).toBeVisible();
}

export async function upload(page: Page, file: string) {
  await page.getByRole("button", { name: "Plattegrond", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(fixture(file));
}

export async function step(page: Page, name: string | RegExp) {
  await page.getByRole("navigation", { name: "Stappen" }).getByRole("button", { name }).click();
}

/** Clicks a point given in page units (PDF points) on the plan overlay. */
export async function clickPlan(page: Page, pageSize: { width: number; height: number }, x: number, y: number) {
  const svg = page.locator(".plan-inner svg");
  await svg.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(100);
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + (x / pageSize.width) * box.width, box.y + (y / pageSize.height) * box.height);
}

/** Confirms every recognised room one by one, the way a user does after checking them. */
export async function confirmAllRooms(page: Page) {
  for (let i = 0; i < 60; i++) {
    const confirm = page.getByRole("button", { name: "Naam en maten kloppen" });
    if (await confirm.count()) {
      await confirm.first().click();
      continue;
    }
    const control = page.getByRole("button", { name: "Controleren" });
    if (!(await control.count())) return;
    await control.first().click();
    if (!(await page.getByRole("button", { name: "Naam en maten kloppen" }).count())) return;
  }
}

/** A paid (DEMO) project with one window, with ScanTag of that window open. */
export async function paidProjectWithWindow(page: Page) {
  await newProject(page);
  await step(page, /Plinten & ramen/);
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo/);
  await page.getByRole("button", { name: "Simuleer geslaagde betaling" }).click();
  await page.waitForURL(/#plinten-ramen$/);
  await page.getByRole("button", { name: "+ Raam toevoegen" }).click();
  await page.locator(".window-card").last().getByRole("button", { name: "Scannen met ScanTag" }).click();
  await expect(page.getByRole("dialog", { name: "ScanTag: meten met je telefoon" })).toBeVisible();
}

/** The opening of the simulated window (fake-webxr.ts): 1200 × 1500 mm, corners in capture order. */
export const OPENING_CORNERS = [
  [0, 0],
  [1200, 0],
  [1200, 1500],
  [0, 1500],
] as const;

/** Aims at each point in turn and captures it, with the WebXR test double installed. */
export async function capturePoints(page: Page, points: readonly (readonly [number, number, number?])[]) {
  const overlay = page.locator(".ar-overlay");
  await expect(overlay).toBeVisible();
  for (const [i, [x, y, out]] of points.entries()) {
    await page.evaluate(
      ([px, py, po]) => (window as unknown as { __xr: { aim: (a: number, b: number, c?: number) => void } }).__xr.aim(px!, py!, po),
      [x, y, out ?? 0],
    );
    const capture = overlay.getByRole("button", { name: "Vastleggen" });
    await expect(capture).toBeEnabled();
    await capture.click();
    if (i < points.length - 1) await expect(overlay.getByText(`Punt ${i + 2} van ${points.length}`)).toBeVisible();
  }
  await expect(overlay).toBeHidden();
}

/** Opens the opening task, starts the AR scan and captures the four corners of the simulated window. */
export async function scanOpening(page: Page, dialog: Locator) {
  const opening = dialog.locator(".task-list > li").filter({ hasText: "Raamopening" });
  await opening.getByRole("button", { name: /Scannen/ }).click();
  await dialog.getByRole("button", { name: "Start de scan" }).click();
  await capturePoints(page, OPENING_CORNERS);
  return opening;
}
