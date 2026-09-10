import { expect, test } from "@playwright/test";

test("affiche la landing et ouvre les parcours connexion et création de compte sans bypass", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Moins de paperasse/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Vos prix restent vos prix/).first(),
  ).toBeVisible();
  await expect(page.getByText("MANUFEO", { exact: true }).first()).toBeVisible();

  await page
    .getByRole("button", { name: "Connexion", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Connexion MANUFEO" }),
  ).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mot de passe oublié ?" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Création de compte MANUFEO" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nom de l’entreprise")).toBeVisible();
  await expect(
    page.getByLabel("Mot de passe", { exact: true }),
  ).toHaveAttribute("minlength", "8");
  await expect(
    page.getByRole("link", { name: "Mot de passe oublié ?" }),
  ).toHaveCount(0);
});

test("permet de demander un lien de récupération sans révéler si le compte existe", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
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
  await page
    .getByRole("button", { name: "Connexion", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(
    page.getByRole("heading", { name: "Mot de passe oublié ?" }),
  ).toBeVisible();

  const email = page.getByLabel("Adresse e-mail");
  await email.click();
  await email.pressSequentially("philippe@example.com");
  await expect(email).toHaveValue("philippe@example.com");
  await email.blur();
  await page
    .getByRole("button", { name: "Recevoir le lien de récupération" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Si un compte MANUFEO existe avec cette adresse",
  );
});

test("garde les formulaires cohérents, affiche le mot de passe et confirme l’inscription", async ({
  page,
}) => {
  let signupCalls = 0;
  await page.route("**/auth/v1/signup**", async (route) => {
    signupCalls++;
    expect(route.request().postDataJSON()).toMatchObject({
      email: "artisan@example.com",
      password: "test-password-2026",
      data: { company_name: "Atelier Test" },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "test-user", email: "artisan@example.com" },
        session: null,
      }),
    });
  });
  await page.goto("/");
  const photo = page.locator(".fp-hero-photo img");
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByLabel("Nom de l’entreprise").fill("Atelier Test");
  await page.getByLabel("Adresse e-mail").fill("artisan@example.com");
  const password = page.getByLabel("Mot de passe", { exact: true });
  await password.fill("test-password-2026");
  await page
    .getByRole("button", { name: "Afficher mot de passe", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Masquer mot de passe", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.locator(".forgeo-auth-primary")).toHaveCSS(
    "background-color",
    "rgb(8, 117, 245)",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vérifiez votre messagerie." }),
  ).toBeVisible();
  expect(signupCalls).toBe(1);
});

test("affiche une erreur de connexion et conserve le lien de récupération", async ({
  page,
}) => {
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connexion", exact: true })
    .first()
    .click();
  await page.getByLabel("Adresse e-mail").fill("artisan@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("wrong-password");
  await page
    .getByRole("button", { name: "Afficher mot de passe", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Mot de passe oublié ?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "E-mail ou mot de passe incorrect.",
  );
});

test("vérifie la mise en page des écrans publics", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Au même endroit.",
  );
  await expect
    .poll(() =>
      page
        .locator(".fp-hero-photo img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Connexion", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Se connecter à MANUFEO",
  );
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click();
  await expect(page.getByLabel("Nom de l’entreprise")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("signup.png"),
    fullPage: true,
  });
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Mot de passe oublié ?" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reset.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("valide la confirmation du nouveau mot de passe puis affiche la réussite", async ({
  page,
}, testInfo) => {
  const user = {
    id: "11111111-2222-4333-8444-555555555555",
    aud: "authenticated",
    role: "authenticated",
    email: "artisan@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-09-01T00:00:00Z",
  };
  await page.addInitScript((testUser) => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: testUser.id, exp: expires, role: "authenticated" })}.test-signature`;
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: accessToken,
        refresh_token: "local-test-only",
        expires_at: expires,
        expires_in: 3600,
        token_type: "bearer",
        user: testUser,
      }),
    );
  }, user);
  let updates = 0;
  await page.route("**/auth/v1/user", async (route) => {
    if (route.request().method() === "PUT") {
      updates++;
      expect(route.request().postDataJSON()).toMatchObject({
        password: "updated-password-2026",
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Choisir un nouveau mot de passe" }),
  ).toBeVisible();
  await page
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill("updated-password-2026");
  await page
    .getByLabel("Confirmer le mot de passe", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Enregistrer le nouveau mot de passe" })
    .click();
  await expect(page.getByRole("status")).toContainText("ne correspondent pas");
  expect(updates).toBe(0);
  await page
    .getByLabel("Confirmer le mot de passe", { exact: true })
    .fill("updated-password-2026");
  await page.screenshot({
    path: testInfo.outputPath("new-password.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Enregistrer le nouveau mot de passe" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mot de passe mis à jour." }),
  ).toBeVisible();
  expect(updates).toBe(1);
});
