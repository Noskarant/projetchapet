import { expect, test } from "@playwright/test";

const legalPages = [
  ["Mentions légales", "/mentions-legales"],
  ["Politique de confidentialité", "/politique-confidentialite"],
  ["CGV", "/cgv"],
] as const;

test("affiche un footer légal MANUFEO complet sur la landing", async ({ page }) => {
  await page.goto("/");

  const footer = page.locator(".fp-footer");
  await expect(footer).toContainText("© 2026 MANUFEO. Tous droits réservés.");

  for (const [label, href] of legalPages) {
    await expect(footer.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }

  await expect(footer.getByRole("link", { name: "Contact", exact: true })).toHaveAttribute(
    "href",
    "mailto:noe.anterieux@importmarginguard.fr",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [label, href] of legalPages) {
  test(`ouvre la page publique ${label}`, async ({ page }) => {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await expect(page.getByText("© 2026 MANUFEO. Tous droits réservés.")).toBeVisible();
    await expect(page.getByRole("link", { name: "MANUFEO, retour à l’accueil" })).toHaveAttribute("href", "/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
