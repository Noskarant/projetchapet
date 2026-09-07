import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };

async function openFreshMobile(page: import("@playwright/test").Page) {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.removeItem("projetchapet-mobile-workspace-v3");
    window.localStorage.removeItem("projetchapet:fresh-start:2026-09-v1");
  });
  await page.reload();
  await expect(page.locator(".rm-header h1")).toHaveText("Devis");
  await expect(page.getByLabel("Créer manuellement")).toBeVisible();
}

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

test("ouvre sur Devis sans données de démonstration", async ({ page }) => {
  await openFreshMobile(page);

  await expect(page.locator(".rm-document-card")).toHaveCount(0);
  await expect(page).not.toHaveURL(/login|signin|auth/i);

  await page.getByLabel("Créer manuellement").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Créer le devis" })).toBeVisible();
});

test("préremplit un devis par dictée IA sans exposer la transcription", async ({ page }) => {
  await openFreshMobile(page);

  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByLabel("Créer manuellement").click();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await page.getByLabel("Raison sociale").fill("SCI Bellevue");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rm-client-card")).toHaveCount(1);

  const customerDetail = page.locator(".rm-modal-backdrop .rm-detail-sheet");
  await expect(customerDetail.getByRole("heading", { name: "SCI Bellevue", exact: true })).toBeVisible();
  await customerDetail.getByRole("button", { name: "Voir les devis", exact: true }).click();
  await expect(page.locator(".rm-header h1")).toHaveText("Devis");
  await page.getByLabel("Créer avec l’IA").click();

  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Saisir ou corriger au clavier" })).toHaveCount(0);
  await injectHiddenAiRequest(
    assistant,
    "Client SCI Bellevue, peinture 18 m² à 32 euros, TVA 10 %.",
  );
  await runHiddenAiAnalysis(assistant);

  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(assistant).toBeHidden();
  await expect(page.locator(".rm-v2-lines article")).toHaveCount(1);
  await expect(page.locator(".rm-v2-lines article").first().locator('input[placeholder="Désignation"]')).not.toHaveValue("");
});

test("l'orbe suit le PCM puis ouvre le brouillon sans bloquer le navigateur", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      resolveMicrophone: () => void;
      emitVoiceSamples: (amplitude: number) => void;
    };
    class FakeAudioContext {
      sampleRate = 48_000;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        const processor = Object.assign(new EventTarget(), {
          connect() {}, disconnect() {},
          onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
        });
        scope.emitVoiceSamples = (amplitude) => {
          const samples = new Float32Array(48_000).fill(amplitude);
          const event = Object.assign(new Event("audioprocess"), {
            inputBuffer: { getChannelData: () => samples },
          });
          processor.dispatchEvent(event);
          processor.onaudioprocess?.(event);
        };
        return processor;
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => new Promise((resolve) => {
        scope.resolveMicrophone = () => resolve({ getTracks: () => [{ stop() {} }] });
      }) },
    });
  });
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { groq: true } }));
  let releaseTranscription!: () => void;
  const transcriptionGate = new Promise<void>((resolve) => { releaseTranscription = resolve; });
  await page.route("**/api/transcribe", async (route) => {
    await transcriptionGate;
    await route.fulfill({ json: { text: "Client SCI Bellevue, peinture 18 m² à 32 euros, TVA 10 %." } });
  });
  await page.goto("/");
  await page.getByLabel("Créer avec l’IA").click();
  const assistant = page.getByRole("dialog", { name: "Créer avec l’IA" });
  await assistant.getByLabel("Commencer la dictée").click();
  const magic = assistant.locator(".forgeo-voice-magic");
  await expect(magic).toHaveAttribute("data-state", "activating");
  await expect(magic).toContainText("Ouverture du micro");
  await page.evaluate(() => (window as typeof window & { resolveMicrophone: () => void }).resolveMicrophone());
  await expect(magic).toHaveAttribute("data-state", "recording");
  await expect(magic).toContainText("Je vous écoute");
  await expect(assistant.getByLabel("Demande à analyser")).toBeHidden();
  await expect(assistant.getByRole("button", { name: "Saisir ou corriger au clavier" })).toHaveCount(0);

  const heights = await page.evaluate(() => {
    const scope = window as typeof window & { emitVoiceSamples: (amplitude: number) => void };
    const bar = document.querySelector<HTMLElement>(".forgeo-voice-wave i")!;
    scope.emitVoiceSamples(0);
    const silent = parseFloat(bar.style.height);
    scope.emitVoiceSamples(0.08);
    return { silent, speaking: parseFloat(bar.style.height) };
  });
  expect(heights.silent).toBe(8);
  expect(heights.speaking).toBeGreaterThan(heights.silent);

  await magic.click();
  await expect(magic).toHaveAttribute("data-state", "processing");
  await expect(magic).toContainText("FORGEO prépare votre devis");
  await expect(assistant.getByLabel("Demande à analyser")).toBeHidden();
  releaseTranscription();
  await expect(page.locator(".rm-v2-editor")).toBeVisible();
  await expect(assistant).toBeHidden();
  const line = page.locator(".rm-v2-lines article");
  await expect(line).toHaveCount(1);
  await expect(line.locator('input[placeholder="Désignation"]')).not.toHaveValue("");
});
