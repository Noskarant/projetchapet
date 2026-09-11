import { expect, test } from "@playwright/test";

function rgbChannels(value: string) {
  return (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
}

test("le mobile retrouve son chrome sombre compact sans commandes superposées", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Polish mobile uniquement.");

  await page.goto("/");
  await Promise.all([
    expect(page.locator(".rm-header")).toBeVisible(),
    expect(page.locator(".rm-bottom-nav")).toBeVisible(),
    expect(page.locator(".rm-create-dock")).toBeVisible(),
  ]);

  const chrome = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".rm-header")!;
    const nav = document.querySelector<HTMLElement>(".rm-bottom-nav")!;
    const navButton = nav.querySelector<HTMLButtonElement>("button")!;
    const navIcon = navButton.querySelector<SVGElement>("svg")!;
    const dock = document.querySelector<HTMLElement>(".rm-create-dock")!;
    const manual = document.querySelector<HTMLElement>(".rm-create-manual");
    const manualRect = manual?.getBoundingClientRect();
    return {
      headerBackground: getComputedStyle(header).backgroundColor,
      navBackground: getComputedStyle(nav).backgroundColor,
      navButtonHeight: navButton.getBoundingClientRect().height,
      navFontSize: Number.parseFloat(getComputedStyle(navButton).fontSize),
      navIconWidth: navIcon.getBoundingClientRect().width,
      dockHeight: dock.getBoundingClientRect().height,
      manualLeft: manualRect?.left ?? 0,
      manualRight: manualRect?.right ?? 0,
      viewportWidth: window.innerWidth,
    };
  });

  expect(rgbChannels(chrome.headerBackground).every((channel) => channel < 35)).toBe(true);
  expect(rgbChannels(chrome.navBackground).every((channel) => channel < 35)).toBe(true);
  expect(chrome.navButtonHeight).toBeGreaterThanOrEqual(44);
  expect(chrome.navFontSize).toBeGreaterThanOrEqual(9);
  expect(chrome.navIconWidth).toBeGreaterThanOrEqual(21);
  expect(chrome.dockHeight).toBeLessThanOrEqual(46);
  expect(chrome.manualLeft).toBeGreaterThanOrEqual(0);
  expect(chrome.manualRight).toBeLessThanOrEqual(chrome.viewportWidth);

  await expect(page.locator(".fbs-launchers")).toBeHidden();
  await expect(page.getByRole("button", { name: "Ouvrir le copilote chantier" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: /Copilote chantier/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Métier & tarifs/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rentabilité chantier/ })).toBeVisible();

  await page.locator(".rm-side-drawer header > button:first-child").click();
  await expect(page.getByRole("button", { name: "Ouvrir le copilote chantier" })).toBeHidden();

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
  await expect(page.getByRole("button", { name: "Ouvrir le copilote chantier" })).toBeHidden();

  const panelBackground = await assistant.locator(".mai-panel").evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(panelBackground).toContain("linear-gradient");
});
