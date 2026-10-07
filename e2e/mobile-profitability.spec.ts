import { expect, test } from "@playwright/test";

test("le suivi de rentabilité calcule les coûts saisis sans modifier les devis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Fonction mobile uniquement.");
  const records: Array<Record<string, unknown>> = [];
  await page.route("**/rest/v1/rpc/ensure_personal_organization", route => route.fulfill({ json: "11111111-1111-4111-8111-111111111111" }));
  await page.route("**/rest/v1/artisan_workflow_records**", async route => {
    if (route.request().method() === "POST") {
      records.push(route.request().postDataJSON());
    }
    await route.fulfill({ json: records.map(record => ({ id: record.id, payload: record.payload })) });
  });
  await page.goto("/");
  const originalQuotes = await page.evaluate(() => JSON.parse(localStorage.getItem("projetchapet-mobile-workspace-v3") || "{}").quotes);
  await page.getByRole("button", { name: "Menu" }).click();
  const profitability = page.getByRole("button", { name: /Rentabilité chantier/ });
  await expect(profitability).toBeVisible();
  await profitability.click();
  const dialog = page.getByRole("dialog", { name: "Rentabilité réelle chantier" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Revenu HT du devis")).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("Renseignez les premiers coûts réels");

  await dialog.getByLabel("Coût main-d’œuvre (€)").fill("100");
  await dialog.getByLabel("Matières (€)").fill("50");
  await dialog.getByLabel("Déplacements (€)").fill("25");
  const actualCost = dialog.getByText("Coût réel", { exact: true }).locator("..");
  await expect(actualCost).toContainText("175,00");

  await dialog.getByRole("button", { name: /Confirmer les coûts réels/ }).click();
  await expect(dialog.getByRole("button", { name: /Coûts enregistrés/ })).toBeVisible();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ kind: "project_cost", payload: { confirmed: true, costs: { labourCost: 100, materialCost: 50, travelCost: 25 } } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("projetchapet-mobile-workspace-v3") || "{}").quotes)).toEqual(originalQuotes);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("forgeo:project-actuals:v1") || "{}")))).toEqual([expect.objectContaining({ labourCost: 100, materialCost: 50, travelCost: 25 })]);
});
