import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };

async function openFreshMobile(page: import("@playwright/test").Page) {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.removeItem("projetchapet-mobile-workspace-v3");
    window.localStorage.removeItem("projetchapet:fresh-start:2026-09-v1");
  });
  await page.reload();
  await expect(page.locator(".rm-header h1")).toHaveText("Devis");
}

test("ouvre sur Devis sans données de démonstration", async ({ page }) => {
  await openFreshMobile(page);

  await expect(page.locator(".rm-document-card")).toHaveCount(0);
  await expect(page).not.toHaveURL(/login|signin|auth/i);

  await page.locator(".rm-create-main").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Créer le devis" })).toBeVisible();
});

test("préremplit un devis par dictée texte depuis le micro IA", async ({ page }) => {
  await openFreshMobile(page);

  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.locator(".rm-create-main").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await page.getByLabel("Raison sociale").fill("SCI Bellevue");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rm-client-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Devis", exact: true }).click();
  await page.getByLabel("Créer avec le micro IA").click();
  await expect(page.getByRole("dialog", { name: "Créer avec l’IA" })).toBeVisible();

  const textarea = page.getByLabel("Demande à analyser");
  if (!(await textarea.isVisible())) {
    await page.getByRole("button", { name: "Saisir ou corriger au clavier" }).click();
  }
  await textarea.fill("Client SCI Bellevue, peinture 18 m² à 32 euros, TVA 10 %.");
  await page.getByRole("button", { name: "Analyser et préparer" }).click();

  await expect(page.getByText("Informations reconnues")).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le formulaire prérempli" }).click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.locator(".rm-v2-lines article")).toHaveCount(1);
  await expect(page.locator(".rm-v2-lines article").first().locator('input[placeholder="Désignation"]')).not.toHaveValue("");
});
