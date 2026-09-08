import { expect, test } from "@playwright/test";

function rgbChannels(value: string) {
  return (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
}

test("le mobile garde des barres compactes, sombres et une dictée sans transcription visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Polish mobile uniquement.");

  await page.goto("/");
  await Promise.all([
    expect(page.locator(".rm-header")).toBeVisible(),
    expect(page.locator(".rm-bottom-nav")).toBeVisible(),
    expect(page.locator(".rm-create-dock")).toBeVisible(),
  ]);

  // Le gate d'auth pilote peut retarder légèrement le montage du shell mobile.
  // On attend les éléments réellement testés au lieu de les lire avant leur création.
  await expect(page.locator(".rm-header")).toBeVisible();
  await expect(page.locator(".rm-bottom-nav")).toBeVisible();
  await expect(page.locator(".rm-create-dock")).toBeVisible();

  const chrome = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".rm-header")!;
    const nav = document.querySelector<HTMLElement>(".rm-bottom-nav")!;
    const dock = document.querySelector<HTMLElement>(".rm-create-dock")!;
    return {
      headerBackground: getComputedStyle(header).backgroundColor,
      navBackground: getComputedStyle(nav).backgroundColor,
      dockHeight: dock.getBoundingClientRect().height,
    };
  });

  expect(rgbChannels(chrome.headerBackground).every((channel) => channel < 35)).toBe(true);
  expect(rgbChannels(chrome.navBackground).every((channel) => channel < 35)).toBe(true);
  expect(chrome.dockHeight).toBeLessThanOrEqual(46);

  const voiceBars = await page.evaluate(() => {
    const wave = document.createElement("span");
    wave.className = "forgeo-voice-wave";
    const bar = document.createElement("i");
    wave.appendChild(bar);
    document.body.appendChild(wave);
    const style = getComputedStyle(bar);
    const result = { width: style.width, maxHeight: style.maxHeight };
    wave.remove();
    return result;
  });

  expect(voiceBars.width).toBe("3px");
  expect(voiceBars.maxHeight).toBe("30px");

  await page.getByLabel("Créer avec l’IA").click();
  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByLabel("Demande à analyser")).toBeHidden();

  const panelBackground = await assistant.locator(".mai-panel").evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(panelBackground).toContain("linear-gradient");
});
