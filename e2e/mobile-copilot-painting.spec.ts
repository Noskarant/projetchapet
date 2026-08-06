import { expect, test } from "@playwright/test";

test("prépare un devis de peinture avec hypothèses, origine des prix et marge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Ouvrir le copilote chantier" }).click();
  const dialog = page.getByRole("dialog", { name: "Copilote chantier" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Description du chantier").fill(
    "Chez SCI BELLEVUE, je dois repeindre un appartement de 65 m² avec les plafonds, quelques fissures et quatre portes.",
  );
  await dialog.getByRole("button", { name: "Analyser le chantier" }).click();

  await expect(dialog.getByText("Proposition prête à vérifier")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Prestations proposées" })).toBeVisible();
  await expect(dialog.getByText("Peinture des murs – deux couches")).toBeVisible();
  await expect(dialog.getByText("Peinture des plafonds – deux couches")).toBeVisible();
  await expect(dialog.getByText(/Surface de murs estimée à 156 m²/)).toBeVisible();
  await expect(dialog.getByText("Estimation générique à confirmer").first()).toBeVisible();
  await expect(dialog.getByLabel("Rentabilité prévisionnelle")).toContainText("Marge estimée");

  await dialog.getByLabel("Je vérifierai les tarifs génériques dans le devis avant tout envoi.").check();
  await dialog.getByRole("button", { name: "Ouvrir le devis brouillon" }).click();

  await expect(dialog).toBeHidden();
  const editor = page.locator(".rm-v2-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("SCI BELLEVUE");
  await expect(editor.getByDisplayValue("Peinture des murs – deux couches")).toBeVisible();
  await expect(editor.getByDisplayValue("Peinture des plafonds – deux couches")).toBeVisible();
});

test("bloque le brouillon tant que les quantités métier sont absentes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Ouvrir le copilote chantier" }).click();
  const dialog = page.getByRole("dialog", { name: "Copilote chantier" });
  await dialog.getByLabel("Description du chantier").fill(
    "Chez SCI BELLEVUE, je dois refaire la peinture intérieure.",
  );
  await dialog.getByRole("button", { name: "Analyser le chantier" }).click();

  await expect(dialog.getByText("Informations à compléter")).toBeVisible();
  await expect(dialog.getByText("Complétez la description avant de créer le brouillon.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ouvrir le devis brouillon" })).toBeDisabled();
});
