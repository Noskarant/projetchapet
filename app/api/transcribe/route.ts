import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "video/webm",
]);

const BTP_PROMPT =
  "Dictée professionnelle d'un artisan français du bâtiment. Vocabulaire possible : devis, facture, client, chantier, plâtrerie, peinture, ratissage, rebouchage, ponçage, impression, sous-couche, deux passes, préparation des supports, protection, fourniture et pose, dépose, évacuation, mètre carré, mètre linéaire, forfait, heure, TVA, HT, TTC, franchise, RSE, SIRET.";

export async function POST(request: Request) {
  const limited = rateLimit(request, "transcribe", 10);
  if (limited) return limited;

  try {
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_AUDIO_BYTES + 1024 * 1024) {
      throw new ApiInputError("La dictée dépasse 24 Mo. Enregistrez-la en plusieurs parties.", 413);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY non configurée.", configured: false },
        { status: 503 },
      );
    }

    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) throw new ApiInputError("Fichier audio manquant.");
    if (file.size === 0) throw new ApiInputError("Le fichier audio est vide.");
    if (file.size > MAX_AUDIO_BYTES) {
      throw new ApiInputError("La dictée dépasse 24 Mo. Enregistrez-la en plusieurs parties.", 413);
    }
    if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type.toLowerCase())) {
      throw new ApiInputError("Format audio non pris en charge.");
    }

    const safeName = (file.name || "dictee.webm").replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
    const form = new FormData();
    form.append("file", file, safeName);
    form.append(
      "model",
      process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
    );
    form.append("language", "fr");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("prompt", BTP_PROMPT);

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Groq API : ${response.status}`);
    }

    const segments = Array.isArray(data.segments)
      ? data.segments.slice(0, 500).map((segment: Record<string, unknown>) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          avg_logprob: segment.avg_logprob,
          no_speech_prob: segment.no_speech_prob,
        }))
      : [];

    const lowConfidenceSegments = segments.filter((segment: Record<string, unknown>) => {
      const probability = Number(segment.avg_logprob);
      const noSpeech = Number(segment.no_speech_prob);
      return (Number.isFinite(probability) && probability < -0.55)
        || (Number.isFinite(noSpeech) && noSpeech > 0.45);
    }).length;

    return NextResponse.json({
      provider: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
      text: String(data.text ?? "").trim().slice(0, 20_000),
      language: data.language ?? "fr",
      duration: data.duration ?? null,
      lowConfidenceSegments,
      segments,
    });
  } catch (error) {
    return errorResponse(error, "Transcription impossible.");
  }
}
