import { devices, expect, test } from "@playwright/test";
import { installFakeWebXR } from "./fake-webxr";
import { newProject, scanOpening, step } from "./helpers";

test("verder op je telefoon: QR-link één keer bruikbaar, scannen op de telefoon, terug naar de computer", async ({ page, browser }) => {
  // Computer: a project with one window, then "Scannen met je telefoon".
  await newProject(page);
  await step(page, /Plinten & ramen/);
  await page.getByRole("button", { name: "+ Raam toevoegen" }).click();
  await page.getByRole("button", { name: "Scannen met je telefoon" }).click();
  const dialog = page.getByRole("dialog", { name: "Scannen met je telefoon" });
  await expect(dialog.getByRole("img", { name: /QR-code/ })).toBeVisible();
  const link = await dialog.getByLabel("Of open deze link op je telefoon").inputValue();
  // No personal data and no lasting secret in the link: everything sensitive is in the fragment, one-time.
  expect(link).toMatch(/\/overdracht#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(link).not.toMatch(/Voorbeeldstraat|project\//);

  // Phone: opens the link, gets the project (decrypted on the phone) and lands in the window register.
  const phone = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:3100", locale: "nl-NL" });
  const mobile = await phone.newPage();
  await installFakeWebXR(mobile);
  await mobile.goto(link);
  await mobile.waitForURL(/\/project\/[a-z0-9]+#plinten-ramen$/);
  expect(mobile.url()).not.toContain("overdracht#");
  await expect(mobile.locator(".window-card")).toHaveCount(1);

  // Scan on the phone (before payment: status only) and send it back.
  await mobile.locator(".window-card").getByRole("button", { name: "Scannen met ScanTag" }).click();
  const scan = mobile.getByRole("dialog", { name: "ScanTag: meten met je telefoon" });
  const opening = await scanOpening(mobile, scan);
  await expect(opening).toContainText("1 scan · Gescand");
  await scan.getByRole("button", { name: "Klaar" }).click();
  await mobile.getByRole("button", { name: "Terugsturen naar je computer" }).click();
  await expect(mobile.getByText("Verstuurd. Je computer haalt je scans op")).toBeVisible();

  // Computer: the scans come in while the dialog is open.
  await expect(dialog.getByText("Scans van je telefoon zijn binnen: 1 raam bijgewerkt, 0 nieuw.")).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Sluiten" }).click();
  await expect(page.locator(".window-card")).toContainText("ScanTag: Nog 1 opname");

  // The same link a second time: used.
  const again = await phone.newPage();
  await again.goto(link);
  await expect(again.locator(".notice[role=alert]")).toContainText("Deze code is al gebruikt.");
  // A broken link: explained, nothing fetched.
  const broken = await phone.newPage();
  await broken.goto("/overdracht#kapot");
  await expect(broken.locator(".notice[role=alert]")).toContainText("Deze link is niet compleet.");
  await phone.close();
});
