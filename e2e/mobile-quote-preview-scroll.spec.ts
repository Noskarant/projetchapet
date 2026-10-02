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

test("iPad Safari : toutes les pages PDF restent lisibles et défilent en plein écran", async ({ playwright }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const browser = await playwright.webkit.launch();
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, storageState: testInfo.project.use.storageState });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/rest/v1/**", route => route.fulfill({ status: 503, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"message":"Offline PDF fixture"}' }));
  await installWorkspace(page, 32);
  await page.goto("http://127.0.0.1:3000/");
  await page.locator(".rm-document-card").first().click();
  const preview = page.locator(".rm-philippe-preview");
  await preview.getByRole("button", { name: "PDF", exact: true }).click();
  const full = page.locator(".rm-document-fullscreen");
  await expect(full).toBeVisible();
  await expect(full.locator("canvas").first()).toBeVisible({ timeout: 20000 });
  await expect.poll(() => full.locator("canvas").count()).toBeGreaterThan(1);
  const first = await full.locator("canvas").first().boundingBox();
  expect(first!.width).toBeGreaterThan(700);
  const viewer = full.locator(".manufeo-pdf-viewer");
  await expect.poll(() => viewer.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await viewer.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => viewer.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(full.locator("canvas").last()).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("ipad-pdf-last-page.png") });
  expect(errors).toEqual([]);
  await full.getByRole("button", { name: "Fermer le PDF plein écran" }).click();
  await expect(preview.locator(".rm-philippe-totals")).toContainText("Total TTC");
  await context.close();
  await browser.close();
});

test("une dictée MP4 conserve son type et une alerte de qualité survit aux segments suivants", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await page.route("**/api/transcribe", async route => {
    expect(route.request().postDataBuffer()?.toString()).toContain("audio/mp4");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "77,10 euros HT", lowConfidenceSegments: 1, needsReview: true }) });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const body = new FormData();
    body.append("file", new File(["compressed-audio-fixture"], "dictee.m4a", { type: "audio/mp4" }));
    return (await fetch("/api/transcribe", { method: "POST", body })).json();
  });
  expect(result.needsReview).toBe(true);
  expect(result.lowConfidenceSegments).toBe(1);
});

test("fait défiler tous les postes et change réellement de vue sur iPhone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");
  await installWorkspace(page, 9);
  await page.goto("/");

  await page.locator(".rm-document-card").first().click();
  const preview = page.locator(".rm-philippe-preview");
  const scroller = preview.locator(".rm-philippe-preview-scroll");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("9 postes", { exact: true })).toBeVisible();
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

  const pdfTab = preview.getByRole("button", { name: "PDF", exact: true });
  const detailTab = preview.getByRole("button", { name: "Détail", exact: true });
  await pdfTab.click();
  await expect(pdfTab).toHaveAttribute("aria-pressed", "true");
  await expect(preview.locator(".manufeo-pdf-viewer canvas").first()).toBeVisible();

  await page.getByRole("button", { name: "Fermer le PDF plein écran" }).click();
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
