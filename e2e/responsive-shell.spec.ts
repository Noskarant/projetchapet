import { expect, test } from "@playwright/test";

test("monte uniquement l’interface adaptée à l’écran", async ({ page }, testInfo) => {
  await page.goto("/");

  if (testInfo.project.name === "iphone-webkit") {
    await expect(page.locator(".rm-shell")).toBeVisible();
    await expect(page.locator(".pc-shell")).toHaveCount(0);
    await expect(page.locator(".rm-header h1")).toHaveText("Devis");

    await page.locator(".rm-bottom-nav").getByRole("button", { name: "Factures" }).click();
    await expect(page.locator(".rm-header h1")).toHaveText("Factures");

    await page.locator(".rm-bottom-nav").getByRole("button", { name: "Clients" }).click();
    await expect(page.locator(".rm-header h1")).toHaveText("Clients");
    return;
  }

  await expect(page.locator(".pc-shell")).toBeVisible();
  await expect(page.locator(".rm-shell")).toHaveCount(0);
  await expect(page.locator(".pc-sidebar nav").getByRole("button", { name: "Tableau de bord" })).toBeVisible();

  await page.locator(".pc-sidebar nav").getByRole("button", { name: "Devis" }).click();
  await expect(page.locator(".pc-content h1")).toHaveText("Devis");

  await page.locator(".pc-sidebar nav").getByRole("button", { name: "Clients" }).click();
  await expect(page.locator(".pc-content h1")).toHaveText("Clients");
});

test("ne sélectionne jamais le premier client par défaut avec l’IA", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Parcours propre à l’interface mobile");
  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", {
      detail: { target: "quote", data: { customer_hint: "", title: "Test", items: [] } },
    }));
  });
  await expect(page.locator('div[role="alert"]').filter({ hasText: "Indiquez le nom du client" })).toBeVisible();
  await expect(page.locator(".rm-v2-editor")).toHaveCount(0);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", {
      detail: {
        target: "quote",
        data: {
          customer_hint: "SCI Bellevue",
          title: "Hall d’entrée",
          items: [{ label: "Préparation", quantity: 1, unit: "forfait", unit_price: 250, tax_rate: 10 }],
        },
      },
    }));
  });
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.locator(".rm-v2-editor select").first()).toHaveValue("C-002");
});

test("reconnaît Madame comme la civilité Mme lors d’une création IA", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Parcours propre à l’interface mobile");
  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", {
      detail: {
        target: "quote",
        data: {
          customer_hint: "Madame Soulier",
          title: "Reprise plafond",
          items: [{ label: "Préparation", quantity: 1, unit: "forfait", unit_price: 310, tax_rate: 10 }],
        },
      },
    }));
  });

  await expect(page.locator('div[role="alert"]')).toHaveCount(0);
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.locator(".rm-v2-editor select").first()).toHaveValue("C-004");
});

test("expose un manifeste PWA valide", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.name).toBe("Projet Chapet");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(2);
});

test("retourne les en-têtes de sécurité du prototype", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["permissions-policy"]).toContain("microphone=(self)");
});
