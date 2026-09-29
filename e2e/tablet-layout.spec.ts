import { expect, test, devices } from "@playwright/test";

// Each device has its own context: desktop-sized touch screens must not be
// mistaken for desktops merely because their viewport exceeds 1024px.
const screens = [
  { name: "iPad portrait", width: 834, height: 1194, touch: true },
  { name: "iPad landscape", width: 1194, height: 834, touch: true },
  { name: "iPad Pro landscape", width: 1376, height: 1032, touch: true },
  { name: "Android tablet", width: 1280, height: 800, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "laptop", width: 1280, height: 800, touch: false },
  { name: "desktop", width: 1440, height: 1000, touch: false },
];

for (const screen of screens) {
  test(`${screen.name}: correct shell, usable navigation, no overflow`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      hasTouch: screen.touch,
      storageState: testInfo.project.use.storageState,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Keep the local fixture intact; this suite checks layout without a live backend.
    await page.route("**/rest/v1/**", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Offline layout fixture"}' }));
    await page.goto("http://127.0.0.1:3000/");
    const field = screen.touch;
    await expect(page.locator(field ? ".rm-shell" : ".pc-shell")).toBeVisible();
    await expect(page.locator(field ? ".pc-shell" : ".rm-shell")).toHaveCount(0);
    if (field) {
      if (screen.width >= 600) {
        const app = await page.locator(".rm-app").boundingBox();
        expect(app!.width).toBeGreaterThan(560);
        const menu = await page.locator(".rm-header-menu").boundingBox();
        expect(menu!.width).toBeGreaterThanOrEqual(44);
      }
      for (const label of ["Factures", "Clients", "Devis"]) {
        await page.locator(".rm-bottom-nav").getByRole("button", { name: label, exact: true }).click();
        await expect(page.locator(".rm-header h1")).toHaveText(label);
      }
      await expect(page.locator(".rm-document-card").first()).toBeVisible();
      if (screen.width >= 900) {
        const cards = page.locator(".rm-document-card");
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();
        expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
      }
      // Rotation must retain the field shell and current tab.
      if (screen.name === "iPad portrait") {
        await page.setViewportSize({ width: 1194, height: 834 });
        await expect(page.locator(".rm-header h1")).toHaveText("Devis");
        await expect(page.locator(".pc-shell")).toHaveCount(0);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${screen.name.replaceAll(' ', '-')}.png`) });
    await context.close();
  });
}

test("iPad Safari landscape keeps the mobile workflows", async ({ playwright }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const browser = await playwright.webkit.launch();
  const context = await browser.newContext({
    ...devices["iPad Pro 11 landscape"],
    storageState: testInfo.project.use.storageState,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/");
  await expect(page.locator(".rm-shell")).toBeVisible();
  await expect(page.locator(".pc-shell")).toHaveCount(0);
  await page.locator(".rm-bottom-nav").getByRole("button", { name: "Clients", exact: true }).click();
  await expect(page.locator(".rm-header h1")).toHaveText("Clients");
  await context.close();
  await browser.close();
});
