import { expect, test } from "@playwright/test";

test("affiche la landing et ouvre les parcours connexion et création de compte sans bypass", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Moins de paperasse/i })).toBeVisible();
  await expect(page.getByText(/Vos prix restent vos prix/).first()).toBeVisible();

  await page.getByRole("button", { name: "J’ai déjà un compte", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Connexion FORGEO" })).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mot de passe oublié ?" })).toBeVisible();

  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Création de compte FORGEO" })).toBeVisible();
  await expect(page.getByLabel("Nom de l’entreprise")).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("minlength", "8");
  await expect(page.getByRole("link", { name: "Mot de passe oublié ?" })).toHaveCount(0);
});

test("permet de demander un lien de récupération sans révéler si le compte existe", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.includes("/auth/v1/recover")) {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "J’ai déjà un compte", exact: true }).click();
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Mot de passe oublié ?" })).toBeVisible();

  await page.getByLabel("Adresse e-mail").fill("philippe@example.com");
  await page.getByRole("button", { name: "Recevoir le lien de récupération" }).click();
  await expect(page.getByRole("status")).toContainText("Si un compte FORGEO existe avec cette adresse");
});
