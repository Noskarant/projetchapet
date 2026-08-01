import { expect, test } from "@playwright/test";

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";

test("regroupe le devis et ses actions dans une seule fiche", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const card = page.locator(".rm-document-card", { hasText: "D-2026-378" });
  await card.click();

  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Détail", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Historique", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Modifier", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Modifier à la voix", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Changer le statut", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Plus", exact: true })).toBeVisible();
  await expect(page.locator(".rm-detail-sheet")).toBeHidden();

  await sheet.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(sheet.getByText("SUIVI DU DOCUMENT")).toBeVisible();
  await expect(sheet.getByText("FACTURATION LIÉE")).toBeVisible();

  await sheet.getByRole("button", { name: "Retour aux devis" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".rm-detail-sheet")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("change le statut et expose les actions secondaires", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });

  await sheet.locator("[data-unified-status]").click();
  const statusDialog = page.getByRole("dialog", { name: "Changer le statut du devis" });
  await expect(statusDialog).toBeVisible();
  await statusDialog.getByRole("button", { name: "Validé", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Changer le statut, actuellement Validé" })).toBeVisible();

  await expect.poll(async () => page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      quotes?: Array<{ id: string; status: string }>;
    };
    return workspace.quotes?.find((quote) => quote.id === "Q-378")?.status;
  }, STORAGE_KEY)).toBe("Validé");

  await sheet.getByRole("button", { name: "Plus", exact: true }).click();
  const more = page.getByRole("dialog", { name: "Autres actions du devis" });
  await expect(more).toBeVisible();
  await expect(more.getByRole("button", { name: "Envoyer le PDF" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Télécharger le PDF" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Dupliquer le devis" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Transformer en facture" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Supprimer le devis" })).toBeVisible();
});