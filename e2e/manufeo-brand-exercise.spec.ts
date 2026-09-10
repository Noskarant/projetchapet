import { expect, test } from "@playwright/test";

test("affiche MANUFEO dans l’application et réserve Exercice au choix de l’année", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone-webkit", "Contrôle desktop uniquement.");

  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await expect(page.locator(".pc-shell")).toBeVisible();
  await expect(page.locator(".pc-brand strong")).toHaveText("MANUFEO");

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
  await expect(page.locator(".rm-side-drawer header small")).toHaveText("MANUFEO");
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
