import { expect, test } from "@playwright/test";
import { paidProjectWithWindow } from "./helpers";

// A camera exists, but the permission request is refused.
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream=deny"] } });

test("camera geweigerd: duidelijke uitleg en een andere weg", async ({ page }) => {
  await paidProjectWithWindow(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Camera starten" }).click();
  await expect(dialog.getByRole("alert")).toContainText("geen toestemming gegeven voor de camera");
  await expect(dialog.getByText("Foto kiezen", { exact: true })).toBeVisible();
});
