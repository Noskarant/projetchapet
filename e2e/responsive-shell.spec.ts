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

  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.locator(".rm-v2-editor select").first()).toHaveValue("C-004");
  await expect(page.locator('div[role="alert"]').filter({ hasText: /client.*introuvable/i })).toHaveCount(0);
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
  expect(response.headers()["strict-transport-security"]).toBe("max-age=31536000");
});

test("ne met pas les réponses API en cache", async ({ request }) => {
  const response = await request.get("/api/ai/status");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});

test("bloque les mutations API provenant d’un autre site", async ({ request }) => {
  const response = await request.post("/api/einvoice", {
    headers: {
      Origin: "https://example-attacker.invalid",
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/json",
    },
    data: { invoice: {}, company: {} },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: "Origine de requête refusée." });
});

test("refuse d’utiliser l’API e-mail comme relais sans document", async ({ request }) => {
  const response = await request.post("/api/email", {
    data: {
      to: "client@example.com",
      subject: "Message sans document",
      html: "<p>Test</p>",
    },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: "Un document PDF est requis pour l’envoi.",
  });
});

test("refuse les pièces jointes qui ne sont pas de vrais PDF", async ({ request }) => {
  const response = await request.post("/api/email", {
    data: {
      to: "client@example.com",
      subject: "Document",
      attachments: [
        {
          filename: "document.pdf",
          content: Buffer.from("contenu qui n'est pas un PDF").toString("base64"),
        },
      ],
    },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: "Seuls les documents PDF valides peuvent être envoyés.",
  });
});
