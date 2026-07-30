import { expect, test } from "@playwright/test";

test("convertit les URL relatives avant de les transmettre au fetch natif de Safari", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Régression propre à Safari iOS");

  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const value = typeof input === "string"
        ? input
        : typeof Request !== "undefined" && input instanceof Request
          ? input.url
          : String(input);
      if (value.startsWith("/")) {
        throw new DOMException("The string did not match the expected pattern.", "SyntaxError");
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });

  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  const status = await page.evaluate(async () => {
    const response = await window.fetch("/api/ai/status", { cache: "no-store" });
    return { ok: response.ok, pathname: new URL(response.url).pathname };
  });

  expect(status.ok).toBeTruthy();
  expect(status.pathname).toBe("/api/ai/status");
});

test("ne montre jamais l’erreur technique WebKit en anglais", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Régression propre à Safari iOS");

  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const value = typeof input === "string"
        ? new URL(input, window.location.href)
        : typeof Request !== "undefined" && input instanceof Request
          ? new URL(input.url)
          : new URL(String(input));
      if (value.pathname === "/api/transcribe") {
        throw new DOMException("The string did not match the expected pattern.", "SyntaxError");
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });

  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  const message = await page.evaluate(async () => {
    try {
      await window.fetch("/api/transcribe", { method: "POST", body: new FormData() });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  expect(message).toContain("Safari n’a pas pu démarrer le service vocal");
  expect(message).not.toContain("expected pattern");
});
