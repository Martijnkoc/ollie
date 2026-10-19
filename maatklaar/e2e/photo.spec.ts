import { expect, test } from "@playwright/test";
import { paidProjectWithWindow, scanOpening } from "./helpers";

test("meten met de camera: twee A4-vellen op de muur, hoeken klikken vast op de randen, maten met foutmarge", async ({ page }) => {
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog", { name: "ScanTag: meten met je camera" });
  const opening = await scanOpening(page, dialog);

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
  await expect(opening).toContainText("1 foto · Gemeten");
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
  await expect(card).toContainText("Met ScanTag gemeten: 6 maten");
  await expect(card).toContainText("Bestelmaat: volgens je leverancier.");
});
