import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { project } from "../src/lib/measurements/photo";

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

/** A paid (DEMO) project with one window, with the photo assistant of that window open. */
export async function paidProjectWithWindow(page: Page) {
  await newProject(page);
  await step(page, /Plinten & ramen/);
  await page.getByRole("button", { name: /Betaal € 8,99/ }).click();
  await page.waitForURL(/\/betaling\/demo/);
  await page.getByRole("button", { name: "Simuleer geslaagde betaling" }).click();
  await page.waitForURL(/#plinten-ramen$/);
  await page.getByRole("button", { name: "+ Raam toevoegen" }).click();
  await page.locator(".window-card").last().getByRole("button", { name: "Scannen met ScanTag" }).click();
  await expect(page.getByRole("dialog", { name: "ScanTag: meten met je camera" })).toBeVisible();
}

// fixtures/raam-foto.jpg: drawn by scripts/make-fixtures.mjs with this homography (wall mm → photo px).
const RAAM_H = [0.9, 0.1, 460, -0.05, 0.95, 190, 0.00008, 0.00002, 1];
export const RAAM_FOTO = { width: 2000, height: 1900 };
const corners = (x0: number, y0: number, x1: number, y1: number) =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => project(RAAM_H, { x: x!, y: y! }));
/** Sheet left, sheet right, opening: in tap order. */
export const RAAM_POINTS = [...corners(-380, 500, -170, 797), ...corners(1360, 900, 1570, 1197), ...corners(0, 0, 1200, 1500)];
// A finger is never exact: every tap lands a few photo pixels off.
const OFF = [
  { x: 3, y: -3 },
  { x: -3, y: 2 },
  { x: 2, y: 3 },
  { x: -2, y: -3 },
];

/** Opens the opening task in the ScanTag dialog, picks the window photo and taps all points. */
export async function scanOpening(page: Page, dialog: Locator) {
  const opening = dialog.locator(".task-list > li").filter({ hasText: "Raamopening" });
  await opening.getByRole("button", { name: "Foto maken" }).click();
  await dialog.locator("input[type=file]:not([capture])").setInputFiles(fixture("raam-foto.jpg"));
  await expect(dialog.getByText("Tik aan: A4-vel 1 (links): linksboven")).toBeVisible();
  const svg = page.getByRole("application", { name: "Foto: punten aanwijzen" });
  for (const [i, p] of RAAM_POINTS.entries()) {
    const box = (await svg.boundingBox())!;
    const q = { x: p.x + OFF[i % 4]!.x, y: p.y + OFF[i % 4]!.y };
    await page.mouse.click(box.x + (q.x / RAAM_FOTO.width) * box.width, box.y + (q.y / RAAM_FOTO.height) * box.height);
  }
  return opening;
}
