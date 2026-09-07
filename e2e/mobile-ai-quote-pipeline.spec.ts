import { expect, test } from "@playwright/test";

const QUENTIN_DUBOIS_TEXT = `Fais-moi un devis pour Quentin Dubois.
Dans le salon, il faut protéger le sol et les meubles, préparer les murs puis faire deux couches de peinture.
Il y a 46 mètres carrés de murs… non attends, 42 mètres carrés, à 32 euros le mètre carré avec TVA à 10 %.
Pour le plafond, compte 18 mètres carrés à 29 euros le mètre carré, TVA 10 %.
Ajoute aussi la peinture des plinthes, 14 mètres linéaires à 9 euros le mètre.
Il y a deux portes à repeindre à 85 euros l’unité.
Dans la chambre, il faut enlever l’ancien papier peint sur 24 mètres carrés à 12 euros le mètre carré, puis préparer et repeindre ces 24 mètres carrés à 30 euros le mètre carré.
Ah et pour les portes, finalement n’en mets qu’une, pas deux.
Ajoute aussi une reprise d’enduit dans le couloir mais je n’ai pas encore la surface exacte.
Et prévois la protection du chantier, mais je ne t’ai pas donné de tarif pour ça.`;

async function injectHiddenAiRequest(assistant: import("@playwright/test").Locator, text: string) {
  const textarea = assistant.getByLabel("Demande à analyser");
  await expect(textarea).toBeHidden();
  await textarea.evaluate((node, value) => {
    const input = node as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

async function seedQuentinDuboisBeforeApp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const workspace = {
      customers: [
        {
          id: "C-QUENTIN-DUBOIS",
          kind: "Professionnel",
          companyName: "Quentin Dubois",
          civility: "",
          lastName: "",
          firstName: "",
          emails: ["quentin.dubois@example.test", ""],
          phones: ["", ""],
          address: "",
          postalCode: "",
          city: "",
          siret: "",
          vat: "",
          notes: "",
        },
      ],
      quotes: [],
      invoices: [],
      agenda: [],
    };
    window.localStorage.setItem("projetchapet:fresh-start:2026-09-v1", "done");
    window.localStorage.setItem("projetchapet-mobile-workspace-v3", JSON.stringify(workspace));
  });
}

test("flux IA devis Quentin Dubois conserve les inconnues et bloque le PDF final incomplet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");

  // Le client doit exister avant de créer un devis/facture. On prépare donc le workspace
  // avant le premier script de l'app, ce qui évite toute course avec le fresh-start mobile.
  await seedQuentinDuboisBeforeApp(page);
  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  await page.locator(".rm-bottom-nav button").filter({ hasText: "Devis" }).click();
  await page.getByRole("button", { name: /Créer avec l.*IA/i }).click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await injectHiddenAiRequest(assistant, QUENTIN_DUBOIS_TEXT);
  await assistant.getByRole("button", { name: "Analyser et préparer" }).evaluate((node) => (node as HTMLButtonElement).click());

  const editor = page.locator(".rm-create-sheet");
  await expect.poll(async () => {
    if (await editor.isVisible().catch(() => false)) return "editor";
    if (await assistant.getByText(/Préparation des murs et deux couches de peinture/i).isVisible().catch(() => false)) return "review";
    return "pending";
  }, { timeout: 12_000 }).not.toBe("pending");

  if (await assistant.getByText(/Préparation des murs et deux couches de peinture/i).isVisible().catch(() => false)) {
    await expect(assistant.getByText("Quentin Dubois", { exact: true })).toBeVisible();
    await expect(assistant.getByText(/Peinture de une porte/i)).toBeVisible();
    expect(await assistant.getByText("À préciser").count()).toBeGreaterThanOrEqual(3);
    await expect(assistant).not.toContainText("1 forfait");
    await expect(assistant).not.toContainText("0,00 €");
    await assistant.getByRole("button", { name: "Ouvrir le formulaire prérempli" }).click();
    await expect(assistant).toBeHidden();
  }

  await expect(editor).toBeVisible();
  await expect(editor.getByText(/Produits et services/i)).toBeVisible();
  expect(await editor.getByText("À préciser").count()).toBeGreaterThanOrEqual(3);
  await expect(editor).toContainText(/3\s*085,00/);
  await expect(editor).toContainText(/3\s*393,50/);

  await editor.getByRole("button", { name: "Aperçu PDF" }).click();
  const detailedPreview = page.locator(".rm-philippe-preview");
  await expect(detailedPreview).toBeVisible();
  for (const label of [/Protection du sol/i, /Reprise d/i, /Protection du chantier/i]) {
    const line = detailedPreview.locator(".rm-philippe-line-card").filter({ hasText: label });
    await expect(line).toContainText("À préciser");
    await expect(line).not.toContainText("0 u");
    await expect(line).not.toContainText("0,00");
    await expect(line).not.toContainText("1 forfait");
  }
  await detailedPreview.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(detailedPreview).toBeHidden();

  await editor.getByRole("button", { name: "Enregistrer" }).click();
  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("projetchapet-mobile-workspace-v3");
    const workspace = raw ? JSON.parse(raw) : null;
    const quote = workspace?.quotes?.find((entry: { customerName?: string }) => entry.customerName === "Quentin Dubois");
    return quote ?? null;
  });

  expect(stored).not.toBeNull();
  expect(stored.subtotal).toBe(3085);
  expect(stored.taxTotal).toBe(308.5);
  expect(stored.total).toBe(3393.5);
  const door = stored.items.find((item: { label?: string }) => /porte/i.test(item.label ?? ""));
  expect(door.quantity).toBe(1);
  expect(door.unitPrice).toBe(85);
  const incomplete = stored.items.filter((item: { incomplete?: boolean; quantity?: number | null; unit?: string | null; unitPrice?: number | null }) => item.incomplete || item.quantity === null || item.unitPrice === null);
  expect(incomplete).toHaveLength(3);
  expect(incomplete.every((item: { quantity?: number | null; unit?: string | null; unitPrice?: number | null }) => item.quantity !== 1 && item.unit !== "forfait" && item.unitPrice !== 0)).toBe(true);
});
