import { expect, test } from "@playwright/test";

test("découpe et recolle une dictée de plus de deux minutes sans minuterie navigateur", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit", "Régression propre au parcours vocal iPhone");

  let receivedChunks = 0;
  const requestSizes: number[] = [];
  await page.route("**/api/transcribe", async (route) => {
    receivedChunks += 1;
    requestSizes.push(route.request().postDataBuffer()?.byteLength ?? 0);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "test",
        text: `partie-${receivedChunks}`,
        duration: 45,
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".rm-shell")).toBeVisible();

  const result = await page.evaluate(async () => {
    const sampleRate = 8_000;
    const seconds = 121;
    const samples = sampleRate * seconds;
    const dataLength = samples * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, dataLength, true);
    for (let index = 44; index < buffer.byteLength; index += 2) view.setInt16(index, 800, true);

    const form = new FormData();
    form.append("file", new File([buffer], "devis-long.wav", { type: "audio/wav" }));
    const controller = new AbortController();
    controller.abort();
    const response = await window.fetch("/api/transcribe", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    return response.json();
  });

  expect(receivedChunks).toBe(3);
  expect(result.text).toBe("partie-1 partie-2 partie-3");
  expect(result.chunks).toBe(3);
  expect(result.long_audio).toBe(true);
  expect(requestSizes.every((size) => size > 0 && size < 1_000_000)).toBe(true);
});
