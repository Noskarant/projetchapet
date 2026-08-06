import { expect, test } from "@playwright/test";

test("place le copilote au-dessus du dock sans bloquer la création manuelle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Ouvrir le copilote chantier" });
  const dock = page.locator(".rm-create-dock");
  const manualCreate = page.locator(".rm-create-main");

  await expect(launcher).toBeVisible();
  await expect(dock).toBeVisible();
  await expect(manualCreate).toBeVisible();

  const launcherBox = await launcher.boundingBox();
  const dockBox = await dock.boundingBox();
  expect(launcherBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect((launcherBox?.y ?? 0) + (launcherBox?.height ?? 0)).toBeLessThanOrEqual((dockBox?.y ?? 0) - 8);

  await manualCreate.click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(launcher).toBeHidden();
});
