import { expect, test } from "@playwright/test";

test("l’assistant unifié reste accessible sans superposer une seconde commande", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Ouvrir le copilote chantier" });
  const manualCreate = page.getByLabel("Créer manuellement", { exact: true });
  await expect(launcher).toBeHidden();
  await expect(manualCreate).toBeVisible();
  const voice = page.getByLabel("Créer avec l’IA", { exact: true });
  await expect(voice).toHaveCount(1);
  await voice.click();
  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await assistant.getByRole("button", { name: "Fermer l’assistant" }).click();
  await expect(assistant).toBeHidden();
  const manualButtonIsTopmost = await manualCreate.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || (target instanceof Node && button.contains(target));
  });
  expect(manualButtonIsTopmost).toBe(true);
  await manualCreate.click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
});
