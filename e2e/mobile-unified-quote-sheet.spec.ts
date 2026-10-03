import { expect, test } from "@playwright/test";

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";

test("regroupe le devis dans une fiche avec le menu d’actions en haut", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  const card = page.locator(".rm-document-card", { hasText: "D-2026-378" });
  await card.click();

  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Détail", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Historique", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Actions du devis" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Envoyer le devis" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Indiquer comme validé" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Modifier", exact: true })).toBeHidden();
  await expect(page.locator(".rm-detail-sheet")).toBeHidden();

  await sheet.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(sheet.getByText("SUIVI DU DOCUMENT")).toBeVisible();
  await expect(sheet.getByText("FACTURATION LIÉE")).toBeVisible();

  await sheet.getByRole("button", { name: "Retour aux devis" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".rm-detail-sheet")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("change le statut et expose toutes les possibilités depuis les trois points", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });

  await sheet.getByRole("button", { name: "Indiquer comme validé" }).click();

  await expect.poll(async () => page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}") as {
      quotes?: Array<{ id: string; status: string }>;
    };
    return workspace.quotes?.find((quote) => quote.id === "Q-378")?.status;
  }, STORAGE_KEY)).toBe("Validé");
  await expect(sheet.getByRole("button", { name: "Transformer en facture" })).toBeVisible();
  await expect(sheet.locator("[data-unified-status]")).toContainText("Validé");
  await page.reload();
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  await expect(sheet.locator("[data-unified-status]")).toContainText("Validé");

  await sheet.getByRole("button", { name: "Actions du devis" }).click();
  const actions = page.getByRole("dialog", { name: "Actions du devis" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Supprimer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Annuler le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Modifier le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Modifier à la voix" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Changer le statut" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Dupliquer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Ouvrir le PDF" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Partager le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Télécharger le PDF" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Imprimer le devis" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Transformer en facture" })).toBeVisible();
});

test("valide le devis sans ancien bouton de statut et permet l’annulation depuis le menu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await expect(sheet.getByRole("button", { name: "Indiquer comme validé" })).toBeVisible();
  // Production can open the unified preview without legacy status controls.
  await page.locator(".rm-detail-sheet .rm-status-editor").evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await sheet.getByRole("button", { name: "Indiquer comme validé" }).click();
  await expect(sheet.locator("[data-unified-status]")).toContainText("Validé");
  await sheet.getByRole("button", { name: "Actions du devis" }).click();
  await page.getByRole("dialog", { name: "Actions du devis" }).getByRole("button", { name: "Annuler le devis" }).click();
  await expect(sheet.locator("[data-unified-status]")).toContainText("Refusé");
});

test("corrige le nom du client depuis le devis puis retrouve la correction après rechargement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  const sheet = page.getByRole("dialog", { name: "Fiche du devis" });
  await sheet.getByRole("button", { name: /^Modifier le client / }).click();
  const editor = page.locator(".rm-v2-editor");
  await expect(editor).toBeVisible();
  const company = editor.getByLabel("Raison sociale", { exact: true });
  if (await company.count()) await company.fill("Orthographe corrigée Test");
  else await editor.getByLabel("Nom", { exact: true }).fill("Orthographe corrigée Test");
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /Modifier le client .*Orthographe corrigée Test/ })).toBeVisible();
  await page.reload();
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  await expect(sheet.getByRole("button", { name: /Modifier le client .*Orthographe corrigée Test/ })).toBeVisible();
});

test("le PDF répond au pincement, aux boutons de zoom et garde toutes ses pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");
  await page.locator(".rm-document-card", { hasText: "D-2026-378" }).click();
  await page.getByRole("dialog", { name: "Fiche du devis" }).getByRole("button", { name: "PDF", exact: true }).click();
  const viewer = page.locator(".rm-document-fullscreen .manufeo-pdf-viewer");
  await expect(viewer.locator("canvas").first()).toBeVisible();
  const originalWidth = await viewer.locator("canvas").first().evaluate(node => node.getBoundingClientRect().width);
  const pageCount = await viewer.locator("canvas").count();
  await viewer.evaluate(node => {
    // WebKit exposes Touch but does not allow constructing it in scripts.
    // Deliver the same coordinates through the viewer's actual event listeners.
    const touches = (offset: number) => [{ identifier: 1, target: node, clientX: 100 - offset, clientY: 200 }, { identifier: 2, target: node, clientX: 200 + offset, clientY: 200 }];
    const dispatch = (type: string, points: ReturnType<typeof touches>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: points });
      node.dispatchEvent(event);
    };
    dispatch("touchstart", touches(0));
    dispatch("touchmove", touches(50));
    dispatch("touchend", []);
  });
  await expect(viewer).toHaveAttribute("data-pdf-scale", "2.00");
  await expect.poll(() => viewer.locator("canvas").first().evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(originalWidth * 1.8);
  await expect(viewer.locator("canvas")).toHaveCount(pageCount);
  await expect.poll(() => viewer.evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  await viewer.getByRole("button", { name: "Adapter le PDF à l’écran" }).click();
  await expect(viewer).toHaveAttribute("data-pdf-scale", "1.00");
  await viewer.getByRole("button", { name: "Agrandir le PDF" }).click();
  await expect(viewer).toHaveAttribute("data-pdf-scale", "1.25");
});
