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
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(sheet).toBeVisible();

  for (const status of statusColors) {
    await sheet.getByRole("button", { name: "Changer le statut", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Changer le statut du devis" });
    await dialog.getByRole("button", { name: status.name, exact: true }).click();

    const indicator = sheet.getByRole("button", {
      name: `Changer le statut, actuellement ${status.name}`,
    });
    await expect(indicator).toBeVisible();
    await expect
      .poll(() => indicator.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(status.background);
  }
});