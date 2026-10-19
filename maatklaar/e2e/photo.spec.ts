import { expect, test, type Page } from "@playwright/test";
import { project } from "../src/lib/measurements/photo";
import { fixture, paidProjectWithWindow } from "./helpers";

// Same homography as scripts/make-fixtures.mjs used to draw fixtures/raam-foto.jpg (wall mm → photo px).
const H = [0.9, 0.1, 260, -0.05, 0.95, 90, 0.00008, 0.00002, 1];
const PHOTO = { width: 1600, height: 1700 };
const corners = (x0: number, y0: number, x1: number, y1: number) =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => project(H, { x: x!, y: y! }));

async function tapPhoto(page: Page, p: { x: number; y: number }) {
  const svg = page.getByRole("application", { name: "Foto: tik de hoeken aan" });
  // The photo scrolls inside the dialog: bring the corner into view first, like a user would.
  await svg.evaluate((el, f) => {
    const wrap = el.closest(".plan-wrap")!;
    wrap.scrollTop = f * el.getBoundingClientRect().height - wrap.clientHeight / 2;
    const dialog = el.closest("dialog")!;
    const y = el.getBoundingClientRect().top + f * el.getBoundingClientRect().height;
    if (y < 40 || y > window.innerHeight - 40) dialog.scrollTop += y - window.innerHeight / 2;
  }, p.y / PHOTO.height);
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + (p.x / PHOTO.width) * box.width, box.y + (p.y / PHOTO.height) * box.height);
}

test("foto-assistent: A4-vel en raamhoeken aantikken geeft een schatting met foutmarge, nooit een bestelmaat", async ({ page }) => {
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Foto kiezen uit je galerij: altijd mogelijk");
  await dialog.locator("input[type=file]").setInputFiles(fixture("raam-foto.jpg"));
  await expect(dialog.getByText("A4-vel: tik linksboven aan")).toBeVisible();
  for (const p of [...corners(400, 300, 610, 597), ...corners(0, 0, 1200, 1500)]) await tapPhoto(page, p);
  const status = dialog.getByRole("status");
  await expect(status).toContainText("browser_scan_estimate, niet bevestigd");
  // The true opening is 1200 × 1500 mm; clicks land on whole screen pixels, so allow a small error.
  const text = (await status.innerText()).replace(/\./g, "");
  const values = [...text.matchAll(/ca (\d+) mm/g)].map((m) => Number(m[1]));
  expect(values).toHaveLength(4);
  for (const v of values.slice(0, 2)) expect(Math.abs(v - 1200)).toBeLessThan(40);
  for (const v of values.slice(2)) expect(Math.abs(v - 1500)).toBeLessThan(40);
  await dialog.getByRole("button", { name: /Opslaan bij R01/ }).click();
  const card = page.locator(".window-card").last();
  await expect(card).toContainText("Foto-schatting (niet bevestigd)");
  await expect(card).toContainText("Meet het raam met een rolmaat");
  await expect(card).toContainText("Bestelmaat: volgens je leverancier.");
});
