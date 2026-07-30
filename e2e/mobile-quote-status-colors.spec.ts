import { expect, test } from "@playwright/test";

const statusColors = [
  { name: "En attente", background: "rgb(245, 158, 11)" },
  { name: "Validé", background: "rgb(34, 197, 94)" },
  { name: "Terminé", background: "rgb(59, 130, 246)" },
  { name: "Refusé", background: "rgb(239, 68, 68)" },
] as const;

test("affiche une couleur métier distincte pour chaque état du devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const previewClose = page.getByRole("button", { name: "Fermer l’aperçu détaillé" });
  if (await previewClose.isVisible()) await previewClose.click();

  const statusEditor = page.locator(".rm-status-editor");
  await expect(statusEditor).toBeVisible();

  for (const status of statusColors) {
    const button = statusEditor.getByRole("button", { name: status.name, exact: true });
    await button.click();
    await expect(button).toHaveClass(/active/);
    await expect
      .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(status.background);
  }
});
