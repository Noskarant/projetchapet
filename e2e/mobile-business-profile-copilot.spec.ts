import { expect, test } from "@playwright/test";

test("le profil métier et les tarifs entreprise sont injectés dans le copilote mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Pont de profil utilisé par l’interface mobile.");

  await page.addInitScript(() => {
    localStorage.setItem("forgeo:business-profile:v1", JSON.stringify({
      version: 1,
      primaryTrade: "upholstery_decorator",
      enabledTrades: ["upholstery_decorator"],
      trades: {
        upholstery_decorator: {
          trade: "upholstery_decorator",
          packVersion: 1,
          settings: { hourlyCost: 41, targetMarginRate: 38, defaultTaxRate: 20, includeTravelFee: true },
          catalog: [{
            code: "upholstery_stripping",
            label: "Dégarnissage atelier",
            description: "Dégarnissage complet",
            unit: "unite",
            unitPriceHt: 190,
            materialCostPerUnit: 5,
            labourHoursPerUnit: 2.5,
            taxRate: 20,
            source: "company_catalog",
          }],
        },
      },
      rules: [],
      updatedAt: new Date().toISOString(),
    }));
  });

  const received: Array<Record<string, unknown>> = [];
  await page.route("**/api/copilot/proposal", async (route) => {
    received.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Configurer le métier et les tarifs FORGEO" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le copilote chantier" }).click();
  await expect(page.getByLabel("Description du chantier")).toHaveAttribute("placeholder", /Voltaire/);
  await expect(page.getByText(/COPILOTE · TAPISSERIE D’AMEUBLEMENT/i)).toBeVisible();

  await page.evaluate(async () => {
    await fetch("/api/copilot/proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Deux fauteuils Voltaire en traditionnel." }),
    });
  });

  expect(received).toHaveLength(1);
  const payload = received[0]!;
  expect(payload.trade).toBe("upholstery_decorator");
  expect((payload.settings as { hourlyCost?: number })?.hourlyCost).toBe(41);
  expect((payload.catalog as Array<{ code?: string; unitPriceHt?: number }>)?.[0]).toMatchObject({
    code: "upholstery_stripping",
    unitPriceHt: 190,
  });
});

test("la configuration métier s’ouvre sans remplacer l’application existante", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Configuration mobile uniquement.");
  await page.goto("/");
  await page.getByRole("button", { name: "Configurer le métier et les tarifs FORGEO" }).click();
  await expect(page.getByRole("dialog", { name: "Configuration métier FORGEO" })).toBeVisible();
  await expect(page.getByLabel("Métier principal")).toHaveValue("interior_painting");
  await expect(page.getByRole("heading", { name: "Métier et tarifs" })).toBeVisible();
});

test("un artisan peut basculer vers électricien et le copilote suit réellement ce métier", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Configuration mobile uniquement.");

  const received: Array<Record<string, unknown>> = [];
  await page.route("**/api/copilot/proposal", async (route) => {
    received.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ error: "test intercepté" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Configurer le métier et les tarifs FORGEO" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Configuration métier FORGEO" });
  await settingsDialog.getByLabel("Métier principal").selectOption("electrician");
  await expect(settingsDialog).toContainText("Prise de courant");
  await settingsDialog.getByLabel("Coût horaire (€)").fill("37");
  await settingsDialog.getByRole("button", { name: "Enregistrer le profil métier" }).click();
  await expect(settingsDialog).toBeHidden();

  const storedTrade = await page.evaluate(() => JSON.parse(localStorage.getItem("forgeo:business-profile:v1") || "{}")?.primaryTrade);
  expect(storedTrade).toBe("electrician");

  await page.getByRole("button", { name: "Ouvrir le copilote chantier" }).click();
  const copilot = page.getByRole("dialog", { name: "Copilote chantier" });
  await expect(copilot.getByText(/COPILOTE · ÉLECTRICITÉ/i)).toBeVisible();
  await expect(copilot.getByLabel("Description du chantier")).toHaveAttribute("placeholder", /2P\+T/);

  await page.evaluate(async () => {
    await fetch("/api/copilot/proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Huit prises 2P+T et quatre DCL." }),
    });
  });

  expect(received).toHaveLength(1);
  expect(received[0]?.trade).toBe("electrician");
  expect((received[0]?.settings as { hourlyCost?: number })?.hourlyCost).toBe(37);
  expect(Array.isArray(received[0]?.catalog)).toBe(true);
});
