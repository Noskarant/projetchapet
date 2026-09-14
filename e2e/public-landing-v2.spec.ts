import { expect, test } from "@playwright/test";

test("présente MANUFEO comme assistant métier complet", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /MANUFEO prépare le reste/i }),
  ).toBeVisible();
  await expect(page.getByText(/Une phrase, plusieurs opérations/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Un seul outil, de la demande client/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Il ne remplit pas juste des cases/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /migration lisible, contrôlée et réversible/i }),
  ).toBeVisible();
  await expect(page.getByText("Tolteck", { exact: true })).toBeVisible();
  await expect(page.getByText("Costructor", { exact: true })).toBeVisible();
  await expect(page.getByText("99 €", { exact: true })).toBeVisible();
});

test("expose une navigation produit claire et des ancres valides", async ({ page }) => {
  await page.goto("/");

  const links = [
    ["Le produit", "#produit"],
    ["Capacités", "#capacites"],
    ["Migration", "#migration"],
    ["Tarifs", "#tarifs"],
  ] as const;

  for (const [label, href] of links) {
    const link = page.getByRole("link", { name: label, exact: true, includeHidden: true });
    await expect(link).toHaveAttribute("href", href);
    await expect(page.locator(href)).toHaveCount(1);
  }

  await expect(page.getByRole("button", { name: /Se connecter/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Créer mon espace/i }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
