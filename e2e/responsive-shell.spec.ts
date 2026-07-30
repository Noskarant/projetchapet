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
