import { expect, test, type Page } from "@playwright/test";

const storageKey = "projetchapet-mobile-workspace-v3";

function installWorkspace(page: Page, itemCount: number) {
  return page.addInitScript(
    ({ key, count }: { key: string; count: number }) => {
      const customer = {
        id: "C-SCROLL",
        kind: "Professionnel",
        companyName: "Entreprise défilement",
        civility: "",
        lastName: "",
        firstName: "",
        emails: ["contact@example.test"],
        phones: ["0600000000"],
        address: "1 rue du Test",
        postalCode: "69000",
        city: "Lyon",
        siret: "000 000 000 00000",
        vat: "FR00000000000",
        notes: "",
      };
      const items = Array.from({ length: count }, (_, index) => ({
        id: `line-${index + 1}`,
        label: `Prestation ${index + 1}`,
        description: `Description détaillée du poste ${index + 1} pour vérifier le défilement vertical sur Safari iPhone.`,
        quantity: index + 1,
        unit: "m²",
        unitPrice: 32 + index,
        taxRate: 10,
      }));
      const subtotal = items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const taxTotal = subtotal * 0.1;
      localStorage.setItem(
        key,
        JSON.stringify({
          customers: [customer],
          quotes: [
            {
              id: "Q-SCROLL",
              number: "D-2026-999",
              customerId: customer.id,
              customerName: customer.companyName,
              title: "Test du défilement",
              issueDate: "2026-07-30",
              expiryDate: "2026-09-30",
              status: "En attente",
              items,
              notes: "",
              subtotal,
              taxTotal,
              total: subtotal + taxTotal,
            },
          ],
          invoices: [],
          agenda: [],
        }),
      );
    },
    { key: storageKey, count: itemCount },
  );
}

test("fait défiler tous les postes et change réellement de vue sur iPhone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await installWorkspace(page, 9);
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.locator(".rm-philippe-preview");
  const scroller = preview.locator(".rm-philippe-preview-scroll");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("9 postes")).toBeVisible();
  await expect(preview.getByText("Faites défiler pour consulter les 9 postes")).toBeVisible();

  const metrics = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(preview.getByText("Prestation 9")).toBeVisible();

  const pageTab = preview.getByRole("button", { name: "Page complète", exact: true });
  const detailTab = preview.getByRole("button", { name: "Détail des postes", exact: true });
  await pageTab.click();
  await expect(pageTab).toHaveAttribute("aria-pressed", "true");
  await expect(preview.locator("iframe")).toBeVisible();

  await detailTab.click();
  await expect(detailTab).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByText("Prestation 1")).toBeVisible();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
});

test("n’affiche pas une fausse instruction de défilement pour un seul poste", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await installWorkspace(page, 1);
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.locator(".rm-philippe-preview");
  await expect(preview.getByText("1 poste", { exact: true })).toBeVisible();
  await expect(preview.getByText("Tous les postes du devis sont affichés.")).toBeVisible();
  await expect(preview.getByText("Faites défiler pour tout consulter")).toBeHidden();
});