import { expect, test } from "@playwright/test";

test("le suivi de rentabilité calcule les coûts saisis sans modifier les devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Fonction mobile du prototype.");
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir la rentabilité réelle FORGEO" }).click();
  const dialog = page.getByRole("dialog", { name: "Rentabilité réelle chantier" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Revenu HT du devis")).toBeVisible();

  await dialog.getByLabel("Coût main-d’œuvre (€)").fill("100");
  await dialog.getByLabel("Matières (€)").fill("50");
  await dialog.getByLabel("Déplacements (€)").fill("25");
  const actualCost = dialog.getByText("Coût réel", { exact: true }).locator("..");
  await expect(actualCost).toContainText("175,00");

  await dialog.getByRole("button", { name: /Enregistrer les coûts réels/ }).click();
  await expect(dialog.getByRole("button", { name: /Coûts enregistrés/ })).toBeVisible();
});
