import { expect, test } from "@playwright/test";

test("affiche des références de prix sourcées sans remplir le devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Contrôle UI mobile ciblé.");

  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "mai-review";
    document.body.appendChild(host);

    void fetch("/api/ai/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "Peindre 42 m² de murs à Lyon" }),
    }).catch(() => undefined);
  });

  const panel = page.getByRole("region", { name: "Références de prix marché" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Peinture murs intérieurs");
  await expect(panel).toContainText("20 €/m²");
  await expect(panel).toContainText("28 €/m²");
  await expect(panel).toContainText("35 €/m²");
  await expect(panel).toContainText("aucune majoration automatique");
  await expect(panel).toContainText("jamais appliquées automatiquement au devis");
});
