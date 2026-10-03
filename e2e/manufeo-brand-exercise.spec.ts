import { expect, test } from "@playwright/test";

test("affiche MANUFEO et conserve l’exercice configuré depuis Mon entreprise", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone-webkit", "Contrôle ordinateur uniquement.");
  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".rm-side-drawer header small")).toHaveText("MANUFEO");
  await page.getByRole("button", { name: /Mon entreprise/ }).click();
  const settings = page.getByRole("dialog", { name: "Paramètres de l’entreprise" });
  await expect(settings).toBeVisible();
  await settings.getByLabel("Date du bilan (MM-JJ)").fill("06-30");
  await expect(settings.getByLabel("Début (MM-JJ)")).toHaveValue("07-01");
  await settings.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(settings).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem("projetchapet:company-profile:v1") || "{}");
    return [profile.accountingStart, profile.accountingEnd];
  })).toEqual(["07-01", "06-30"]);
});

test("le mobile restauré conserve MANUFEO sans débordement des actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Contrôle mobile uniquement.");

  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  const drawerHeader = page.locator(".rm-side-drawer header > div");
  await expect(page.locator(".rm-side-drawer header small")).toHaveText("MANUFEO");
  const drawerLogo = await drawerHeader.evaluate((node) => getComputedStyle(node, "::before").backgroundImage);
  expect(drawerLogo).toContain("manufeo-mark.webp");
  await page.locator(".rm-side-drawer header > button:first-child").click();

  const bounds = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".rm-create-dock")?.getBoundingClientRect();
    const manual = document.querySelector<HTMLElement>(".rm-create-manual")?.getBoundingClientRect();
    return {
      dockLeft: dock?.left ?? -1,
      dockRight: dock?.right ?? Number.MAX_SAFE_INTEGER,
      manualLeft: manual?.left ?? -1,
      manualRight: manual?.right ?? Number.MAX_SAFE_INTEGER,
      viewport: innerWidth,
    };
  });
  expect(bounds.dockLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.dockRight).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.manualLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.manualRight).toBeLessThanOrEqual(bounds.viewport);
});

test("sert les assets finaux MANUFEO et les référence dans le manifest", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "iphone-webkit", "Smoke assets exécuté une seule fois.");

  for (const path of ["/manufeo-mark.webp", "/manufeo-logo.webp", "/icon-192.webp", "/icon-512.webp"]) {
    const response = await request.get(path);
    expect(response.ok(), `${path} doit être servi`).toBeTruthy();
  }

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = (await manifestResponse.json()) as { name?: string; icons?: Array<{ src?: string }> };
  expect(manifest.name).toBe("MANUFEO");
  expect(manifest.icons?.map((icon) => icon.src)).toEqual(
    expect.arrayContaining(["/icon-192.webp", "/icon-512.webp"]),
  );
});
