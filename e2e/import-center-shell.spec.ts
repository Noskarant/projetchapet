import { expect, test } from "@playwright/test";

test("le centre d'import est accessible depuis les paramètres entreprise", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".manufeo-splash")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /Mon entreprise.*SIRET/ }).click();
  const settings = page.getByRole("dialog", { name: "Paramètres de l’entreprise" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Ouvrir le centre d’import" }).click();
  await expect(page.getByRole("dialog", { name: "Centre d’import MANUFEO" })).toBeVisible();
  await expect(page.getByText("Déposez votre export CSV")).toBeVisible();
});
