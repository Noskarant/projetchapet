import { expect, test } from "@playwright/test";

test("range le copilote dans le menu sans bloquer la création", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Ouvrir le copilote chantier" });
  const manualCreate = page.locator(".rm-create-main");

  await expect(launcher).toBeHidden();
  await expect(manualCreate).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  const menuEntry = page.getByRole("button", { name: /Copilote chantier/ });
  await expect(menuEntry).toBeVisible();
  await menuEntry.click();

  await expect(page.getByRole("dialog", { name: "Copilote chantier" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer le copilote" }).click();

  const manualButtonIsTopmost = await manualCreate.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || (target instanceof Node && button.contains(target));
  });
  expect(manualButtonIsTopmost).toBe(true);
  await manualCreate.click({ trial: true });
});
