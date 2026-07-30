import { expect, test } from "@playwright/test";

test("crée un rendez-vous dans l’agenda depuis une demande naturelle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-bottom-nav button").filter({ hasText: "Agenda" }).click();
  await expect(page.locator(".rm-bottom-nav button.active")).toContainText("Agenda");
  await page.locator(".rm-create-ai").click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByText("NOUVEL ÉVÉNEMENT")).toBeVisible();

  await assistant.getByLabel("Demande à analyser").fill(
    "Mets-moi un rendez-vous demain à 14h30 avec SCI Bellevue à 4 place du Monteil pour faire le point avant démarrage.",
  );
  await assistant.getByRole("button", { name: "Analyser et préparer" }).click();

  await expect(assistant.getByText("Rendez-vous", { exact: true })).toBeVisible();
  await expect(assistant.getByText(/SCI Bellevue.*4 place du Monteil/i)).toBeVisible();
  await assistant.getByRole("button", { name: "Ajouter directement à l’agenda" }).click();

  await expect(assistant).toBeHidden();
  await expect(page.locator(".rm-bottom-nav button.active")).toContainText("Agenda");
  await expect(page.getByRole("status").filter({ hasText: "Événement ajouté à l’agenda" })).toBeVisible();

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("projetchapet-mobile-workspace-v3");
    const workspace = raw ? JSON.parse(raw) : null;
    return workspace?.agenda?.find((entry: { title?: string }) => entry.title?.includes("4 place du Monteil")) ?? null;
  });

  expect(stored).not.toBeNull();
  expect(stored.time).toBe("14:30");
  expect(stored.customerName).toBe("SCI BELLEVUE");
  expect(stored.title).toBe("Rendez-vous · 4 place du Monteil");

  const expectedTomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  expect(stored.date).toBe(expectedTomorrow);
  await expect(page.locator(".rm-agenda-list")).toContainText("14:30 · Rendez-vous · 4 place du Monteil");
});
