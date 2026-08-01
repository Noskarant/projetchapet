import { expect, test } from "@playwright/test";

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";

test("regroupe le devis dans une fiche avec le menu d’actions en haut", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const card = page.locator(".rm-document-card", { hasText: "D-2026-378" });
  await card.click();

  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Détail", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Historique", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Actions du devis" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Envoyer le devis" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Indiquer comme validé" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Modifier", exact: true })).toBeHidden();
  await expect(page.locator(".rm-detail-sheet")).toBeHidden();

  await sheet.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(sheet.getByText("SUIVI DU DOCUMENT")).toBeVisible();
  await expect(sheet.getByText("FACTURATION LIÉE")).toBeVisible();

  await sheet.getByRole("button", { name: "Retour aux devis" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".rm-detail-sheet")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("change le statut et expose toutes les possibilités depuis les trois points", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });

  await sheet.getByRole("button", { name: "Indiquer comme validé" }).click();
  await expect(sheet.getByRole("button", { name: "Changer le statut, actuellement Validé" })).toBeVisible();

  await expect.poll(async () => page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      quotes?: Array<{ id: string; status: string }>;
    };
    return workspace.quotes?.find((quote) => quote.id === "Q-378")?.status;
  }, STORAGE_KEY)).toBe("Validé");

  await sheet.getByRole("button", { name: "Actions du devis" }).click();
  const actions = page.getByRole("dialog", { name: "Actions du devis" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Supprimer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Annuler le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Modifier le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Modifier à la voix" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Changer le statut" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Dupliquer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Ouvrir le PDF" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Partager le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Télécharger le PDF" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Imprimer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Transformer en facture" })).toBeVisible();
});
