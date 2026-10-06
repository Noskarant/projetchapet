import { expect, test } from "@playwright/test";

const forbiddenVisibleCopy = /(?:démo|démonstration|@saschapet\.com|PROJET CHAPET|CHAPET SAS|CHAPET Père & Fils)/i;
const tutoiement = /\b(?:ton|ta|tes|toi|tu)\b|\b(?:Renseigne|Utilise|Réessaie)\b/i;

test("le pilote mobile n’affiche plus l’ancienne identité ni le tutoiement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Contrôle de copie mobile uniquement.");

  await page.goto("/");
  await expect(page.locator(".manufeo-splash")).toHaveCount(0);
  await expect(page.locator(".rm-header")).toBeVisible();

  await page.getByLabel("Menu").click();
  await expect(page.locator(".rm-side-drawer")).toBeVisible();

  await expect.poll(async () => page.locator("body").innerText()).not.toMatch(forbiddenVisibleCopy);
  await expect.poll(async () => page.locator("body").innerText()).not.toMatch(tutoiement);

  await page.locator(".rm-drawer-list button", { hasText: "Comptable & facturation" }).click();
  const settings = page.getByRole("dialog", { name: "Paramètres de l’entreprise" });
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel("E-mail du comptable")).toBeVisible();

  await expect.poll(async () => page.locator("body").innerText()).not.toMatch(forbiddenVisibleCopy);
  await expect(settings.getByRole("button", { name: "Ouvrir le centre de facturation électronique" })).toBeVisible();
});
