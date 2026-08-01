import { expect, test } from "@playwright/test";

test("ne montre plus jamais l’ancien écran d’actions du devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();

  const unifiedSheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(unifiedSheet).toBeVisible();

  const legacyBackdrop = page.locator(".rm-legacy-quote-detail-backdrop");
  await expect(legacyBackdrop).toHaveCount(1);
  await expect(legacyBackdrop).toBeHidden();
  await expect(legacyBackdrop.locator(".rm-detail-sheet")).toHaveAttribute("aria-hidden", "true");

  await unifiedSheet.getByRole("button", { name: "Actions du devis" }).click();
  const actions = page.getByRole("dialog", { name: "Actions du devis" });
  await actions.getByRole("button", { name: "Modifier le devis" }).click();

  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(legacyBackdrop).toBeHidden();
});

test("conserve la fiche existante des factures", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Factures", exact: true }).click();
  await page.locator(".rm-document-card").first().click();

  const invoiceDetail = page.locator(".rm-detail-sheet", { hasText: "FACTURE" });
  const invoiceBackdrop = page.locator(".rm-modal-backdrop").filter({ has: invoiceDetail });
  await expect(invoiceDetail).toBeVisible();
  await expect(invoiceDetail.locator("header small")).toHaveText("FACTURE");
  await expect(invoiceBackdrop).not.toHaveClass(/rm-legacy-quote-detail-backdrop/);
});
