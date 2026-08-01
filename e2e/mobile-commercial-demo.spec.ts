import { expect, test } from "@playwright/test";

test("applique des filtres avancés aux devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const filterButton = page.getByRole("button", { name: "Filtrer les devis" });
  await expect(filterButton).toBeVisible();
  await filterButton.click();

  const panel = page.getByRole("dialog", { name: "Filtres avancés" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Client").selectOption("C-002");
  await panel.getByLabel("Statut").selectOption("En attente");
  await panel.getByLabel("Montant minimum").fill("1000");
  await panel.getByRole("button", { name: "Appliquer les filtres" }).click();

  const visibleCards = page.locator(".rm-document-card:not(.rm-commercial-hidden)");
  await expect(visibleCards).toHaveCount(1);
  await expect(visibleCards.first()).toContainText("D-2026-376");
  await expect(filterButton.locator("b")).toHaveText("3");
});

test("ouvre un centre chantier interactif et une vue collaborateur sans prix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Interface collaborateurs/ }).click();

  const panel = page.getByRole("dialog", { name: "Chantiers & équipe" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("SCI Bellevue", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("50 %").first()).toBeVisible();

  await panel.getByRole("button", { name: /Voir comme l’équipe/ }).click();
  await expect(panel.getByText("ESPACE ÉQUIPE")).toBeVisible();
  const step = panel.getByRole("button", { name: /Première couche murs et plafond/ });
  await step.click();
  await expect(step).toHaveClass(/done/);

  await panel.getByRole("button", { name: /Consulter le document/ }).click();
});

test("centralise notifications, sauvegarde et envoi du PDF", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Notifications" }).click();
  const notifications = page.getByRole("dialog", { name: "Centre d’attention" });
  await expect(notifications).toBeVisible();
  await expect(notifications.getByText(/point.*à regarder/)).toBeVisible();
  await notifications.getByRole("button", { name: "Fermer" }).click();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Sauvegarde & transfert/ }).click();
  const backup = page.getByRole("dialog", { name: "Sauvegarde & transfert" });
  await expect(backup.getByText("Exporter une sauvegarde complète")).toBeVisible();
  await backup.getByRole("button", { name: "Fermer" }).click();
  await page.locator(".rm-side-drawer header button").click();

  await page.locator(".rm-document-card").first().click();
  const quote = page.getByRole("dialog", { name: "Fiche du devis" });
  await quote.getByRole("button", { name: "Plus", exact: true }).click();
  const more = page.getByRole("dialog", { name: "Autres actions du devis" });
  await more.getByRole("button", { name: "Envoyer le PDF" }).click();

  const email = page.getByRole("dialog", { name: "Envoyer le document" });
  await expect(email).toBeVisible();
  await expect(email.getByText(/notes personnelles restent exclues/i)).toBeVisible();
  await expect(email.getByRole("button", { name: "Envoyer avec le PDF" })).toBeVisible();
});