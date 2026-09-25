import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/transcribe/route";

test("la dictée de devis utilise le modèle de transcription précis et guide les décimales", async () => {
  const priorKey = process.env.GROQ_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    const form = options?.body as FormData;
    assert.equal(form.get("model"), "whisper-large-v3");
    assert.match(String(form.get("prompt")), /18,50 mètres carrés/);
    assert.match(String(form.get("prompt")), /noms et prénoms épelés/);
    return Response.json({ text: "18,50 mètres carrés à 21 euros hors taxes, TVA 10 %." });
  };
  try {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([82, 73, 70, 70])], "dictee.wav", { type: "audio/wav" }));
    const response = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { text: string };
    assert.match(payload.text, /18,50 mètres carrés/);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = priorKey;
  }
});
