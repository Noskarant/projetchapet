import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };

async function openMobile(page: import("@playwright/test").Page) {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.removeItem("projetchapet-mobile-workspace-v3");
    window.localStorage.removeItem("projetchapet:fresh-start:2026-09-v1");
  });
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("un nouvel artisan démarre avec des listes vides", async ({ page }) => {
  await openMobile(page);
  await page.getByRole("button", { name: "Devis", exact: true }).click();
  await expect(page.locator(".rm-document-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await expect(page.locator(".rm-client-card")).toHaveCount(0);
});

test("la dictée IA ne montre jamais la transcription technique", async ({ page }) => {
  await openMobile(page);
  await page.getByLabel("Créer avec l’IA").click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByLabel("Demande à analyser")).toBeHidden();
  await expect(assistant.getByRole("button", { name: "Saisir ou corriger au clavier" })).toHaveCount(0);
});

test("le shell mobile réserve moins de hauteur aux barres système", async ({ page }) => {
  await openMobile(page);

  const dimensions = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".rm-header");
    const nav = document.querySelector<HTMLElement>(".rm-bottom-nav");
    return {
      header: header?.getBoundingClientRect().height ?? 0,
      nav: nav?.getBoundingClientRect().height ?? 0,
    };
  });

  expect(dimensions.header).toBeLessThanOrEqual(70);
  expect(dimensions.nav).toBeLessThanOrEqual(72);
});

test("les paramètres entreprise sont accessibles et l'exercice est modifiable", async ({ page }) => {
  await openMobile(page);
  await page.getByLabel("Menu").click();
  await page.getByRole("button", { name: /Mon entreprise/ }).click();
  await page.getByRole("button", { name: /Modifier les informations/ }).click();

  const settings = page.getByRole("dialog", { name: "Paramètres de l’entreprise" });
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel("Raison sociale")).toBeVisible();
  await expect(settings.getByLabel("Début (MM-JJ)")).toHaveValue("01-01");
  await expect(settings.getByText(/Envoi réel (connecté|à configurer)/)).toBeVisible();
});
