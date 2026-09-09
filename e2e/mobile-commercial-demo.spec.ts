import { expect, test } from "@playwright/test";

const COMMERCIAL_STATE_KEY = "forgeo-commercial-state-v2";

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

  await page.addInitScript(({ key }) => {
    if (sessionStorage.getItem(`${key}:fixture-loaded`)) return;
    sessionStorage.setItem(`${key}:fixture-loaded`, "1");
    localStorage.setItem(key, JSON.stringify({
      company: {
        legalName: "",
        displayName: "Votre entreprise",
        siret: "",
        vat: "",
        email: "",
        accountingEmail: "",
        phone: "",
        address: "",
        postalCode: "",
        city: "",
        quoteValidityDays: 60,
        paymentTerms: "Paiement à 30 jours.",
        accent: "blue",
      },
      collaborators: [
        { id: "COL-TEST", name: "Alex Martin", role: "Chef d’équipe", phone: "", initials: "AM", active: true },
      ],
      projects: [
        {
          id: "PROJECT-BELLEVUE",
          name: "Chantier Atelier",
          subtitle: "Peinture murs et plafond",
          customerId: "C-002",
          quoteId: "Q-376",
          invoiceId: "I-018",
          address: "Adresse chantier",
          status: "En cours",
          startDate: "2026-09-01",
          nextVisit: "2026-09-10",
          teamIds: ["COL-TEST"],
          steps: [
            { id: "STEP-1", label: "Protection du chantier", assigneeId: "COL-TEST", dueDate: "2026-09-07", done: true },
            { id: "STEP-2", label: "Préparation des supports", assigneeId: "COL-TEST", dueDate: "2026-09-08", done: true },
            { id: "STEP-3", label: "Première couche murs et plafond", assigneeId: "COL-TEST", dueDate: "2026-09-10", done: false },
            { id: "STEP-4", label: "Finitions", assigneeId: "COL-TEST", dueDate: "2026-09-11", done: false },
          ],
          issues: [],
          photos: [],
        },
      ],
      activity: [],
      filters: {
        quote: { customerId: "", status: "", dateFrom: "", dateTo: "", minAmount: "", maxAmount: "" },
        invoice: { customerId: "", status: "", dateFrom: "", dateTo: "", minAmount: "", maxAmount: "" },
      },
    }));
  }, { key: COMMERCIAL_STATE_KEY });

  await page.goto("/");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Interface collaborateurs/ }).click();

  const panel = page.getByRole("dialog", { name: "Chantiers & équipe" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Chantier Atelier", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("50 %").first()).toBeVisible();

  await panel.getByRole("button", { name: /Voir comme l’équipe/ }).click();
  await expect(panel.getByText("ESPACE ÉQUIPE")).toBeVisible();
  const step = panel.getByRole("button", { name: /Première couche murs et plafond/ });
  await step.click();
  await expect(step).toHaveClass(/done/);

  await expect.poll(() => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return state.projects?.[0]?.steps?.find((item: { id: string }) => item.id === "STEP-3")?.done;
  }, COMMERCIAL_STATE_KEY)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Interface collaborateurs/ }).click();
  await expect(panel.getByText("Chantier Atelier", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("75 %").first()).toBeVisible();
  await panel.getByRole("button", { name: /Voir comme l’équipe/ }).click();
  await expect(panel.getByRole("button", { name: /Première couche murs et plafond/ })).toHaveClass(/done/);

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
  await quote.getByRole("button", { name: "Envoyer le devis" }).click();

  const email = page.getByRole("dialog", { name: "Envoyer le document" });
  await expect(email).toBeVisible();
  await expect(email.getByText(/notes personnelles restent exclues/i)).toBeVisible();
  await expect(email.getByRole("button", { name: "Envoyer avec le PDF" })).toBeVisible();
});
