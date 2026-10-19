import { expect, test } from "@playwright/test";
import { paidProjectWithWindow } from "./helpers";

// Chromium's built-in test camera, with the permission granted.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
});

test("camera met toestemming: live beeld, foto maken en daarna punten aantikken", async ({ page }) => {
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Foto maken" }).first().click();
  await dialog.getByRole("button", { name: "Camera in de browser" }).click();
  const video = dialog.getByLabel("Camerabeeld");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Foto maken" }).click();
  await expect(dialog.getByText("Tik aan: A4-vel 1 (links): linksboven")).toBeVisible();
});
