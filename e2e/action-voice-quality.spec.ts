import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const build = buildSync({ stdin: { resolveDir: root, loader: "tsx", contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Assistant from './app/action-voice-assistant';
createRoot(document.getElementById('root')).render(<Assistant/>);
` }, bundle: true, write: false, outdir: "/tmp/voice-quality-bundle", jsx: "automatic", minify: true,
  define: { "process.env.NODE_ENV": '"production"', "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://backend.manufeo.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" }) },
  tsconfig: path.join(root, "tsconfig.json") });

test("l’assistant de production impose la correction d’une transcription incertaine avant toute action", async ({ page }, info) => {
  test.skip(info.project.name !== "iphone-webkit");
  let planningCalls = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://voice.manufeo.test/**", async route => {
    const url = route.request().url();
    if (url.endsWith("/api/ai/status")) return route.fulfill({ json: { groq: true } });
    if (url.endsWith("/api/transcribe")) return route.fulfill({ json: { text: "Plaque de plâtre hydro, 4,50 mètres carrés à 77,10 euros HT, TVA 10 %.", lowConfidenceSegments: 1, needsReview: true } });
    if (url.includes("/api/actions/") || url.includes("/api/ai/parse")) { planningCalls += 1; return route.fulfill({ status: 500 }); }
    return route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div></body></html>' });
  });
  await page.goto("https://voice.manufeo.test/");
  await page.evaluate(() => {
    const node = () => ({ connect() {}, disconnect() {} });
    class FakeAudioContext {
      sampleRate = 8000; state = "running"; destination = node();
      async resume() {} async close() {}
      createMediaStreamSource() { return node(); }
      createGain() { return { ...node(), gain: { value: 0 } }; }
      createScriptProcessor() {
        const processor = { ...node(), onaudioprocess: null as null | ((event: unknown) => void) };
        window.setTimeout(() => processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } }), 50);
        return processor;
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  });
  const css = build.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  await page.addStyleTag({ content: css });
  const health = page.waitForResponse(response => response.url().endsWith("/api/ai/status"));
  await page.addScriptTag({ content: build.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  await (await health).finished();
  // The mobile shell opens this assistant through the event bridge; its desktop
  // launcher is intentionally hidden by the production CSS.
  await expect(page.locator(".ava-launcher")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("projetchapet:open-ai", { detail: { target: "quote" } })));
  await page.getByTestId("voice-preview-button").click();
  await expect(page.getByTestId("voice-listening-visualizer")).toBeVisible();
  // Controlled PCM data tests the real capture/response flow without claiming acoustic accuracy.
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "J’ai fini de parler" }).click();
  await expect(page.locator("#ava-correction")).toHaveValue(/4,50 mètres carrés à 77,10/);
  await expect(page.getByRole("button", { name: "Valider et exécuter" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeEnabled();
  expect(planningCalls).toBe(0);
  expect(errors).toEqual([]);
});
