import { expect, test } from "@playwright/test";

test("affiche la fiche unique, le détail des postes et le PDF", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("button", { name: "Détail", exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Historique", exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Actions du devis" })).toBeVisible();
  await expect(preview.locator(".rm-philippe-line-card").first()).toBeVisible();
  await expect(preview.getByText("Prix unitaire HT").first()).toBeVisible();
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Total HT");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("TVA");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Total TTC");
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Remise");

  await preview.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(preview.locator("iframe")).toBeVisible();
});

test("ouvre directement la modification depuis le menu en haut", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.getByRole("dialog", { name: "Fiche du devis" });
  await preview.getByRole("button", { name: "Actions du devis" }).click();
  const actions = page.getByRole("dialog", { name: "Actions du devis" });
  await actions.getByRole("button", { name: "Modifier le devis" }).click();

  const editor = page.locator(".rm-v2-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByText("Notes personnelles")).toBeVisible();
  await expect(editor.getByText("jamais visibles sur le devis ou le PDF client")).toBeVisible();
  await expect(editor.getByText("Notes visibles sur le devis")).toBeVisible();

  await editor.locator(".rm-private-notes-textarea").fill(
    "Sous-traitant Martin — devis de 1 850 €",
  );
  await editor.locator(".rm-private-discount-input").fill("4");
  await editor.getByRole("button", { name: "Aperçu PDF" }).click();

  const updatedPreview = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(updatedPreview).toBeVisible();
  await expect(updatedPreview.getByText("Sous-traitant Martin — devis de 1 850 €")).toBeVisible();
  await expect(updatedPreview.locator(".rm-philippe-totals .discount")).toContainText("-4 %");
  await expect(updatedPreview.getByText("Ces informations ne figurent jamais sur le PDF client.")).toBeVisible();
});
