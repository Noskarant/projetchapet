import { expect, test } from "@playwright/test";

async function injectHiddenAiRequest(
  assistant: import("@playwright/test").Locator,
  text: string,
) {
  const textarea = assistant.getByLabel("Demande à analyser");
  await expect(textarea).toBeHidden();
  await textarea.evaluate((node, value) => {
    const input = node as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

async function runHiddenAiAnalysis(assistant: import("@playwright/test").Locator) {
  const button = assistant.getByRole("button", { name: "Analyser et préparer" });
  await expect(button).toBeVisible();
  await button.evaluate((node) => (node as HTMLButtonElement).click());
}

test("crée un rendez-vous dans l’agenda depuis une demande naturelle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.goto("/");

  await page.locator(".rm-bottom-nav button").filter({ hasText: "Agenda" }).click();
  await expect(page.locator(".rm-bottom-nav button.active")).toContainText("Agenda");
  await page.locator(".rm-create-main").click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByText("NOUVEL ÉVÉNEMENT")).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Saisir ou corriger au clavier" })).toHaveCount(0);

  await injectHiddenAiRequest(
    assistant,
    "Mets-moi un rendez-vous demain à 14h30 avec SCI Bellevue à 4 place du Monteil pour faire le point avant démarrage.",
  );
  await runHiddenAiAnalysis(assistant);

  await expect(assistant.getByText("Rendez-vous", { exact: true })).toBeVisible();
  await expect(assistant.getByText(/SCI Bellevue.*4 place du Monteil/i)).toBeVisible();
  await assistant.getByRole("button", { name: "Ajouter directement à l’agenda" }).click();

  await expect(assistant).toBeHidden();
  await expect(page.locator(".rm-bottom-nav button.active")).toContainText("Agenda");
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("projetchapet-mobile-workspace-v3");
    const workspace = raw ? JSON.parse(raw) : null;
    return Boolean(workspace?.agenda?.some((entry: { title?: string }) => entry.title?.includes("4 place du Monteil")));
  }), { timeout: 8_000 }).toBe(true);

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
