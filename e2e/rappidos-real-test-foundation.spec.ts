import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };

async function openMobile(page: import("@playwright/test").Page) {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("un nouvel artisan démarre avec des listes vides", async ({ page }) => {
  await openMobile(page);
  await page.getByRole("button", { name: "Devis", exact: true }).click();
  await expect(page.locator(".rm-document-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await expect(page.locator(".rm-client-card")).toHaveCount(0);
});

test("la dictée masque le texte technique par défaut", async ({ page }) => {
  await openMobile(page);
  await page.getByLabel("Créer avec le micro IA").click();
  const textarea = page.getByLabel("Demande à analyser");
  await expect(textarea).toBeHidden();
  await expect(page.getByRole("button", { name: "Saisir ou corriger au clavier" })).toBeVisible();
  await page.getByRole("button", { name: "Saisir ou corriger au clavier" }).click();
  await expect(textarea).toBeVisible();
});

test("les paramètres entreprise sont accessibles et l'exercice est modifiable", async ({ page }) => {
  await openMobile(page);
  await page.getByLabel("Menu").click();
  await page.getByRole("button", { name: /Mon entreprise/ }).click();
  await page.getByRole("button", { name: /Modifier les informations/ }).click();
  await expect(page.getByRole("dialog", { name: "Paramètres de l’entreprise" })).toBeVisible();
  await expect(page.getByLabel("Raison sociale")).toBeVisible();
  await expect(page.getByLabel("Début (MM-JJ)")).toHaveValue("01-01");
  await expect(page.getByText(/Envoi réel (connecté|à configurer)/)).toBeVisible();
});
