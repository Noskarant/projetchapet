"use client";

import { useEffect } from "react";
import { mergeTranscriptParts, splitPcmWav } from "@/lib/long-voice-audio";

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function absoluteInput(input: RequestInfo | URL) {
  if (isRequest(input)) return input;
  return new URL(String(input), window.location.href).href;
}

function requestPath(input: RequestInfo | URL) {
  const value = isRequest(input) ? input.url : String(input);
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value;
  }
}

function retryable(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function copyFormData(source: FormData, file: File) {
  const result = new FormData();
  source.forEach((value, key) => {
    if (key !== "file") result.append(key, value);
  });
  result.append("file", file);
  return result;
}

async function fetchWithRetry(
  fetcher: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit,
) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(absoluteInput(input), { ...init, signal: undefined });
      lastResponse = response;
      if (response.ok || !retryable(response.status) || attempt === 1) return response;
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      await wait(retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 450);
    } catch (error) {
      if (attempt === 1) throw error;
      await wait(450);
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error("La transcription vocale a été interrompue.");
}

async function transcribeLongAudio(
  fetcher: typeof window.fetch,
  source: FormData,
  init: RequestInit,
) {
  const entry = source.get("file");
  if (!(entry instanceof Blob)) return fetcher("/api/transcribe", { ...init, signal: undefined });

  const chunks = await splitPcmWav(entry);
  const transcripts: string[] = [];
  let lastPayload: Record<string, unknown> = {};

  for (let index = 0; index < chunks.length; index += 1) {
    window.dispatchEvent(new CustomEvent("projetchapet:voice-progress", {
      detail: { current: index + 1, total: chunks.length },
    }));

    const file = new File(
      [chunks[index]],
      `dictee-${String(index + 1).padStart(3, "0")}.wav`,
      { type: "audio/wav" },
    );
    const response = await fetchWithRetry(fetcher, "/api/transcribe", {
      ...init,
      body: copyFormData(source, file),
      signal: undefined,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return new Response(JSON.stringify(payload), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    lastPayload = payload;
    transcripts.push(String(payload.text ?? ""));
  }

  return new Response(JSON.stringify({
    ...lastPayload,
    text: mergeTranscriptParts(transcripts),
    chunks: chunks.length,
    long_audio: chunks.length > 1,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default function MobileLongVoiceBridge() {
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);

    const longVoiceFetch: typeof window.fetch = async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/transcribe" && init?.body instanceof FormData) {
        try {
          return await transcribeLongAudio(previousFetch, init.body, init);
        } catch (error) {
          const technical = error instanceof Error ? `${error.name} ${error.message}` : "";
          const message = /expected pattern|did not match the expected pattern/i.test(technical)
            ? "Safari a interrompu l’envoi audio. Relancez la dictée sans fermer cette fenêtre."
            : "La transcription longue a été interrompue. Réessayez sans fermer cette fenêtre.";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (path === "/api/ai/parse" || path === "/api/ai/parse-strict") {
        return previousFetch(absoluteInput(input), { ...init, signal: undefined });
      }

      return previousFetch(input, init);
    };

    window.fetch = longVoiceFetch;
    return () => {
      if (window.fetch === longVoiceFetch) window.fetch = previousFetch;
    };
  }, []);

  return null;
}
