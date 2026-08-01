import { expect, test } from "@playwright/test";

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";

async function closeAutomaticPreview(page: import("@playwright/test").Page) {
  const close = page.getByRole("button", { name: "Fermer l’aperçu détaillé" });
  if (await close.isVisible().catch(() => false)) await close.click();
}

test("modifie réellement un devis existant à la voix après confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");

  await page.route("**/api/ai/command", async (route) => {
    const body = route.request().postDataJSON() as { target?: { entity?: string; id?: string } };
    expect(body.target?.entity).toBe("quote");
    expect(body.target?.id).toBe("Q-378");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "test",
        data: {
          entity: "quote",
          id: "Q-378",
          summary: "Prix de la peinture et statut modifiés.",
          changes: { status: "Validé" },
          line_operations: [{
            action: "update",
            match: "Peinture séjour et couloir",
            prix_unitaire_ht: 42,
            taux_tva: 10,
          }],
        },
      }),
    });
  });

  await page.goto("/");
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  await closeAutomaticPreview(page);

  const voiceButton = page.getByRole("button", { name: "Modifier à la voix" });
  await expect(voiceButton).toBeVisible();
  await voiceButton.click();

  const assistant = page.getByRole("dialog", { name: "Modifier à la voix" });
  await expect(assistant).toBeVisible();
  await assistant.locator("textarea").fill("Sur la ligne peinture séjour et couloir, passe le prix à 42 euros et mets le devis en validé.");
  await assistant.getByRole("button", { name: "Analyser" }).click();
  await expect(assistant.getByText("Prix de la peinture et statut modifiés.")).toBeVisible();
  await assistant.getByRole("button", { name: "Appliquer" }).click();

  await expect.poll(async () => page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      quotes?: Array<{ id: string; status: string; items: Array<{ label: string; unitPrice: number }> }>;
    };
    const quote = workspace.quotes?.find((item) => item.id === "Q-378");
    return {
      status: quote?.status,
      price: quote?.items.find((item) => /peinture séjour/i.test(item.label))?.unitPrice,
    };
  }, STORAGE_KEY)).toEqual({ status: "Validé", price: 42 });
});

test("modifie un événement d’agenda à la voix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");

  await page.route("**/api/ai/command", async (route) => {
    const body = route.request().postDataJSON() as { target?: { entity?: string; id?: string } };
    expect(body.target?.entity).toBe("agenda");
    expect(body.target?.id).toBe("A-01");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "test",
        data: {
          entity: "agenda",
          id: "A-01",
          summary: "Intervention déplacée avec le client Bellevue.",
          changes: {
            date: "2026-08-11",
            time: "14:30",
            title: "Rendez-vous de préparation",
            type: "Chantier",
            customer_id: "C-002",
            customer_name: "SCI BELLEVUE",
          },
          line_operations: [],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: /08:30.*Commander peinture façade/ }).click();

  const voiceButton = page.getByRole("button", { name: "Modifier à la voix" });
  await expect(voiceButton).toBeVisible();
  await voiceButton.click();

  const assistant = page.getByRole("dialog", { name: "Modifier à la voix" });
  await assistant.locator("textarea").fill("Déplace ce rendez-vous au 11 août à 14 h 30 avec SCI Bellevue et appelle-le rendez-vous de préparation.");
  await assistant.getByRole("button", { name: "Analyser" }).click();
  await expect(assistant.getByText("Intervention déplacée avec le client Bellevue.")).toBeVisible();
  await assistant.getByRole("button", { name: "Appliquer" }).click();

  await expect.poll(async () => page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      agenda?: Array<{ id: string; date: string; time: string; title: string; customerId: string }>;
    };
    const entry = workspace.agenda?.find((item) => item.id === "A-01");
    return entry && { date: entry.date, time: entry.time, title: entry.title, customerId: entry.customerId };
  }, STORAGE_KEY)).toEqual({
    date: "2026-08-11",
    time: "14:30",
    title: "Rendez-vous de préparation",
    customerId: "C-002",
  });
});

test("archive un devis validé uniquement lorsque sa facture liée est payée", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Factures", exact: true }).click();
  await page.locator(".rm-document-card", { hasText: "F-2026-019" }).click();
  await page.getByRole("button", { name: /Marquer payée/ }).click();
  await page.locator(".rm-detail-sheet header button").first().click();

  await page.getByRole("button", { name: "Devis", exact: true }).click();
  await page.getByRole("button", { name: "Validé", exact: true }).click();
  await expect(page.locator(".rm-document-card", { hasText: "D-2026-377" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tous", exact: true }).click();
  const archived = page.locator(".rm-document-card", { hasText: "D-2026-377" });
  await expect(archived).toHaveCount(1);
  await expect(archived).toContainText("Terminé");

  const storedStatus = await page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      quotes?: Array<{ id: string; status: string }>;
    };
    return workspace.quotes?.find((item) => item.id === "Q-377")?.status;
  }, STORAGE_KEY);
  expect(storedStatus).toBe("Terminé");
});

test("ouvre le centre de préparation à la facturation électronique", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Comptable & facturation/ }).click();
  const readinessButton = page.getByRole("button", { name: "Ouvrir le centre de facturation électronique" });
  await expect(readinessButton).toBeVisible();
  await readinessButton.click();

  const dialog = page.getByRole("dialog", { name: "Centre de facturation électronique" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1er septembre 2026", { exact: true })).toBeVisible();
  await expect(dialog.getByText("1er septembre 2027", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Factur-X, UBL et CII", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Plateforme agréée", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/aucun envoi réglementaire réel/i)).toBeVisible();
});
