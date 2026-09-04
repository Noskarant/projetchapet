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
  await expect(page.getByLabel("Créer manuellement")).toBeVisible();
}

async function injectHiddenAiRequest(
  assistant: import("@playwright/test").Locator,
  text: string,
) {
  const textarea = assistant.getByLabel("Demande à analyser");
  await expect(textarea).toBeHidden();
  await textarea.evaluate((node, value) => {
    const input = node as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

test("ouvre sur Devis sans données de démonstration", async ({ page }) => {
  await openFreshMobile(page);

  await expect(page.locator(".rm-document-card")).toHaveCount(0);
  await expect(page).not.toHaveURL(/login|signin|auth/i);

  await page.getByLabel("Créer manuellement").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Créer le devis" })).toBeVisible();
});

test("préremplit un devis par dictée IA sans exposer la transcription", async ({ page }) => {
  await openFreshMobile(page);

  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByLabel("Créer manuellement").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await page.getByLabel("Raison sociale").fill("SCI Bellevue");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rm-client-card")).toHaveCount(1);

  const customerDetail = page.locator(".rm-modal-backdrop .rm-detail-sheet");
  await expect(customerDetail.getByRole("heading", { name: "SCI Bellevue", exact: true })).toBeVisible();
  await customerDetail.getByRole("button", { name: "Voir les devis", exact: true }).click();
  await expect(page.locator(".rm-header h1")).toHaveText("Devis");
  await page.getByLabel("Créer avec l’IA").click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Saisir ou corriger au clavier" })).toHaveCount(0);
  await injectHiddenAiRequest(
    assistant,
    "Client SCI Bellevue, peinture 18 m² à 32 euros, TVA 10 %.",
  );
  await assistant.getByRole("button", { name: "Analyser et préparer" }).click();

  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(assistant).toBeHidden();
  await expect(page.locator(".rm-v2-lines article")).toHaveCount(1);
  await expect(page.locator(".rm-v2-lines article").first().locator('input[placeholder="Désignation"]')).not.toHaveValue("");
});
