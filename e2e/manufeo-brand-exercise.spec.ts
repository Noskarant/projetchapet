import { expect, test } from "@playwright/test";

test("affiche MANUFEO dans l’application et réserve Exercice au choix de l’année", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone-webkit", "Contrôle desktop uniquement.");

  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await expect(page.locator(".pc-shell")).toBeVisible();
  await expect(page.locator(".pc-brand strong")).toHaveText("MANUFEO");
  await expect(page.locator(".pc-brand > div")).toHaveCSS("background-image", /manufeo-mark\.webp/);

  const exercise = page.getByRole("button", { name: "Choisir l’année de l’exercice" });
  await expect(exercise).toContainText("Exercice");
  await exercise.click();

  const menu = page.getByRole("menu", { name: "Choisir l’année de l’exercice" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Paramètres de l’entreprise" })).toHaveCount(0);

  const targetYear = new Date().getFullYear() - 1;
  await menu.getByRole("menuitemradio", { name: new RegExp(`^${targetYear}`) }).click();
  await expect(exercise).toContainText(`Exercice ${targetYear}`);
  await expect(menu).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("manufeo:accounting-exercise-year:v1")))
    .toBe(String(targetYear));
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
