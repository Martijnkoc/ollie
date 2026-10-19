import { expect, test, type Page } from "@playwright/test";
import { project } from "../src/lib/measurements/photo";
import { fixture, paidProjectWithWindow } from "./helpers";

// Same homography as scripts/make-fixtures.mjs used to draw fixtures/raam-foto.jpg (wall mm → photo px).
const H = [0.9, 0.1, 460, -0.05, 0.95, 190, 0.00008, 0.00002, 1];
const PHOTO = { width: 2000, height: 1900 };
const corners = (x0: number, y0: number, x1: number, y1: number) =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => project(H, { x: x!, y: y! }));
// A finger is never exact: every tap lands a few photo pixels off.
const off = [
  { x: 3, y: -3 },
  { x: -3, y: 2 },
  { x: 2, y: 3 },
  { x: -2, y: -3 },
];

async function tap(page: Page, p: { x: number; y: number }) {
  const svg = page.getByRole("application", { name: "Foto: punten aanwijzen" });
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + (p.x / PHOTO.width) * box.width, box.y + (p.y / PHOTO.height) * box.height);
}

test("meten met de camera: twee A4-vellen op de muur, hoeken klikken vast op de randen, maten met foutmarge", async ({ page }) => {
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog", { name: "Meten met je camera" });
  const opening = dialog.locator(".task-list > li").filter({ hasText: "Raamopening" });
  await opening.getByRole("button", { name: "Foto maken" }).click();
  await expect(dialog.getByText("Plak twee A4-vellen plat op de muur", { exact: false })).toBeVisible();
  await dialog.locator("input[type=file]:not([capture])").setInputFiles(fixture("raam-foto.jpg"));
  await expect(dialog.getByText("Tik aan: A4-vel 1 (links): linksboven")).toBeVisible();

  const points = [...corners(-380, 500, -170, 797), ...corners(1360, 900, 1570, 1197), ...corners(0, 0, 1200, 1500)];
  for (const [i, p] of points.entries()) await tap(page, { x: p.x + off[i % 4]!.x, y: p.y + off[i % 4]!.y });

  // The corners snapped onto the edges: the true opening is 1200 × 1500 mm, and the margin is a few mm.
  const status = dialog.getByRole("status").filter({ hasText: "Gemeten in deze foto" });
  await expect(status).toContainText("Gemeten in deze foto");
  const values = [...(await status.innerText()).replace(/\./g, "").matchAll(/: (\d+) mm ± (\d+) mm/g)].map((m) => ({
    mm: Number(m[1]),
    u: Number(m[2]),
  }));
  expect(values).toHaveLength(6);
  values.forEach((v, i) => {
    const truth = i < 3 ? 1200 : 1500;
    expect(Math.abs(v.mm - truth)).toBeLessThanOrEqual(3);
    expect(Math.abs(v.mm - truth)).toBeLessThanOrEqual(v.u);
    expect(v.u).toBeLessThanOrEqual(12);
  });
  await dialog.getByRole("button", { name: "Meting opslaan" }).click();
  await expect(opening).toContainText("1 foto · gemeten");
  await expect(opening).toContainText(/Breedte boven: 1\.?2\d\d mm ± \d+ mm/);
  await dialog.getByRole("button", { name: "Klaar" }).click();

  // On to what the camera did not measure (the depth), the questions and the confirmation.
  const wizard = page.getByRole("dialog", { name: "Raam meten" });
  await expect(wizard.getByLabel("Diepte van de dag")).toBeVisible();
  await wizard.getByLabel("Diepte van de dag").fill("95");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  for (const radio of await wizard.getByRole("radio", { name: "Nee" }).all()) await radio.check();
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await expect(wizard.getByRole("row", { name: /Breedte boven/ })).toContainText("(camera)");
  await wizard.getByLabel(/Ik heb alle maten van dit raam nagekeken/).check();
  await wizard.getByRole("button", { name: "Klaar" }).click();

  const card = page.locator(".window-card").last();
  await expect(card).toContainText("Door jou bevestigd");
  await expect(card).toContainText("Met de camera gemeten: 6 maten");
  await expect(card).toContainText("Bestelmaat: volgens je leverancier.");
});
