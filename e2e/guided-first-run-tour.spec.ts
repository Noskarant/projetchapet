import { expect, test } from "@playwright/test";

// Le Quality principal utilise le bypass d'auth : on vérifie ici que le nouveau
// tutoriel n'altère pas le shell lorsqu'il est volontairement désactivé.
test("guided tour stays out of the auth-bypass shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Visite guidée MANUFEO" })).toHaveCount(0);
  await expect(page.getByText("MANUFEO", { exact: true }).first()).toBeVisible();
});
