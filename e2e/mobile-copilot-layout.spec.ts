import { expect, test } from "@playwright/test";

test("range le copilote à droite au-dessus du dock sans bloquer la création", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Ouvrir le copilote chantier" });
  const dock = page.locator(".rm-create-dock");
  const manualCreate = page.locator(".rm-create-main");

  await expect(launcher).toBeVisible();
  await expect(dock).toBeVisible();
  await expect(manualCreate).toBeVisible();
  await expect(launcher.locator("span")).toBeHidden();

  const launcherBox = await launcher.boundingBox();
  const dockBox = await dock.boundingBox();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(launcherBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(launcherBox?.width ?? 999).toBeLessThanOrEqual(52);
  expect(viewportWidth - ((launcherBox?.x ?? 0) + (launcherBox?.width ?? 0))).toBeLessThanOrEqual(20);
  expect((launcherBox?.y ?? 0) + (launcherBox?.height ?? 0)).toBeLessThanOrEqual((dockBox?.y ?? 0) - 8);

  const manualButtonIsTopmost = await manualCreate.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || (target instanceof Node && button.contains(target));
  });
  expect(manualButtonIsTopmost).toBe(true);
  await manualCreate.click({ trial: true });
});
