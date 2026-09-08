import { expect, test } from "@playwright/test";

async function mountReviewAndFeedTranscript(page: import("@playwright/test").Page, transcript: string) {
  await page.evaluate((value) => {
    const existing = document.querySelector(".mai-review");
    existing?.remove();
    const host = document.createElement("div");
    host.className = "mai-review";
    document.body.appendChild(host);

    void fetch("/api/ai/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: value }),
    }).catch(() => undefined);
  }, transcript);
}

test("affiche des références 5.1 sourcées et n'applique un prix que sur choix explicite", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Contrôle UI mobile ciblé.");

  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await mountReviewAndFeedTranscript(page, "Peindre 42 m² de murs à Lyon");

  const panel = page.getByRole("region", { name: "Références de prix marché" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Peinture murs intérieurs");
  await expect(panel).toContainText("20 €/m²");
  await expect(panel).toContainText("28 €/m²");
  await expect(panel).toContainText("35 €/m²");
  await expect(panel).toContainText(/maj\. 21\/08\/2026/i);
  await expect(panel).toContainText(/n.est injecté qu.à l.ouverture du formulaire/i);

  await panel.getByRole("button", { name: /Utiliser le prix Marché pour Peinture murs intérieurs/i }).click();
  await expect(panel).toContainText("Sélectionné ✓");

  const applied = await page.evaluate(() => {
    const detail = {
      target: "quote",
      data: { items: [{ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: null, tax_rate: 10 }] },
    };
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", { detail }));
    return detail.data.items[0];
  });
  expect(applied).toEqual({ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: 28, tax_rate: 10 });
});

test("le choix de prix 5.1 ne remplace jamais un prix dicté", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Contrôle UI mobile ciblé.");

  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await mountReviewAndFeedTranscript(page, "Peindre 42 m² de murs");
  const panel = page.getByRole("region", { name: "Références de prix marché" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /Utiliser le prix Marché pour Peinture murs intérieurs/i }).click();

  const result = await page.evaluate(() => {
    const detail = {
      target: "quote",
      data: { items: [{ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: 32, tax_rate: 10 }] },
    };
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", { detail }));
    return detail.data.items[0];
  });
  expect(result).toEqual({ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: 32, tax_rate: 10 });
});
