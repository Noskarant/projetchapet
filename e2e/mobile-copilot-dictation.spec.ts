import { expect, test } from "@playwright/test";

test("dicte le chantier via enregistrement audio sans utiliser SpeechRecognition Safari", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-webkit");

  await page.addInitScript(() => {
    (window as typeof window & { __copilotSpeechStarted?: boolean }).__copilotSpeechStarted = false;

    class FakeSpeechRecognition {
      lang = "fr-FR";
      continuous = true;
      interimResults = false;
      onresult = null;
      onerror = null;
      onend = null;
      start() {
        (window as typeof window & { __copilotSpeechStarted?: boolean }).__copilotSpeechStarted = true;
      }
      stop() {}
    }

    class FakeMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }

      state: "inactive" | "recording" = "inactive";
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType || "audio/mp4";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        const data = new Blob([new Uint8Array(1024)], { type: this.mimeType });
        this.ondataavailable?.({ data });
        window.setTimeout(() => this.onstop?.(), 0);
      }
    }

    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => undefined }],
        }),
      },
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });

  let transcriptionCalls = 0;
  await page.route("**/api/transcribe", async (route) => {
    transcriptionCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "whisper-large-v3-turbo",
        text: "Chez SCI Bellevue, repeindre un appartement de 65 m² avec les plafonds et quatre portes.",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir le copilote chantier" }).click();

  const dictation = page.locator(".mcp-dictation");
  const textarea = page.locator("#mcp-description");
  await expect(dictation).toBeVisible();
  await expect(textarea).toHaveValue("");

  await dictation.click();
  await expect(dictation).toHaveText("Arrêter la dictée");
  expect(await page.evaluate(() => (window as typeof window & { __copilotSpeechStarted?: boolean }).__copilotSpeechStarted)).toBe(false);

  await dictation.click();
  await expect(textarea).toHaveValue(/SCI Bellevue/);
  await expect(textarea).toHaveValue(/65 m²/);
  expect(transcriptionCalls).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { __copilotSpeechStarted?: boolean }).__copilotSpeechStarted)).toBe(false);
});
