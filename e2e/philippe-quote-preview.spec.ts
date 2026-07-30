import { expect, test } from "@playwright/test";

test("affiche le détail scrollable, les prix unitaires et la page complète", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.locator(".rm-philippe-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Détail des postes")).toBeVisible();
  await expect(preview.locator(".rm-philippe-line-card").first()).toBeVisible();
  await expect(preview.getByText("Prix unitaire HT").first()).toBeVisible();
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Total HT");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("TVA");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Total TTC");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Remise");

  await preview.getByRole("button", { name: "Page complète" }).click();
  await expect(preview.locator("iframe")).toBeVisible();
});

test("sépare les notes personnelles du contenu client", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  await page.getByRole("button", { name: "Fermer l’aperçu détaillé" }).click();
  await page.locator(".rm-detail-actions").getByRole("button", { name: "Tout modifier" }).click();

  const editor = page.locator(".rm-v2-editor");
  await expect(editor.getByText("Notes personnelles")).toBeVisible();
  await expect(editor.getByText("jamais visibles sur le devis ou le PDF client")).toBeVisible();
  await expect(editor.getByText("Notes visibles sur le devis")).toBeVisible();

  await editor.locator(".rm-private-notes-textarea").fill(
    "Sous-traitant Martin — devis de 1 850 €",
  );
  await editor.locator(".rm-private-discount-input").fill("4");
  await editor.getByRole("button", { name: "Aperçu PDF" }).click();

  const preview = page.locator(".rm-philippe-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Sous-traitant Martin — devis de 1 850 €")).toBeVisible();
  await expect(preview.locator(".rm-philippe-totals .discount")).toContainText("-4 %");
  await expect(preview.getByText("Ces informations ne figurent jamais sur le PDF client.")).toBeVisible();
});
