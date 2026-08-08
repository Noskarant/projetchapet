import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  "Dictée professionnelle d'un artisan français du bâtiment. Le locuteur peut hésiter, se reprendre, annuler une ligne et corriger un nom, une quantité, un prix ou une TVA. La dictée peut être un segment d'un devis plus long : respecte strictement l'ordre et ne conclus pas prématurément. Vocabulaire possible : devis, facture, client, chantier, plâtrerie, peinture, ratissage, rebouchage, ponçage, impression, sous-couche, finition, fût, deux passes, préparation des supports, protection, fourniture et pose, dépose, évacuation, mètre carré, mètre linéaire, forfait, heure, main-d'œuvre, TVA, HT, TTC, SIRET.";

function buildGroqForm(file: File) {
  const safeName = (file.name || "dictee.wav").replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
  const form = new FormData();
  form.append("file", file, safeName);
  form.append("model", process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo");
  form.append("language", "fr");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", BTP_PROMPT);
  return form;
}

function isPatternError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /expected pattern|did not match the expected pattern/i.test(`${error.name} ${error.message}`);
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function groqTranscription(file: File, apiKey: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(90_000),
        body: buildGroqForm(file),
      });

      lastStatus = response.status;
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;

      if (attempt === 0 && retryableStatus(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }

      if (response.status === 413) {
        throw new ApiInputError("Le segment audio est trop volumineux. Relancez la dictée.", 413);
      }
      if (response.status === 429) {
        throw new ApiInputError("Le service vocal est momentanément très sollicité. Réessayez dans quelques secondes.", 429);
      }
      throw new ApiInputError("La transcription vocale n’a pas pu être terminée. Réessayez sans fermer cette fenêtre.", 502);
    } catch (error) {
      if (error instanceof ApiInputError) throw error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      if (isPatternError(error)) {
        throw new ApiInputError("Safari a interrompu l’envoi audio. Appuyez de nouveau sur le micro et recommencez la dictée.", 502);
      }
      throw new ApiInputError("Connexion au service vocal interrompue. Réessayez sans recharger la page.", 502);
    }
  }

  throw new ApiInputError(
    lastStatus === 429
      ? "Le service vocal est momentanément très sollicité. Réessayez dans quelques secondes."
      : "La transcription vocale n’a pas pu être terminée. Réessayez sans fermer cette fenêtre.",
    lastStatus === 429 ? 429 : 502,
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "transcribe", 60);
  if (limited) return limited;

  try {
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_AUDIO_BYTES + 1024 * 1024) {
      throw new ApiInputError("Le segment audio dépasse 24 Mo. Relancez la dictée.", 413);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Le service de transcription n’est pas configuré.", configured: false },
        { status: 503 },
      );
    }

    let input: FormData;
    try {
      input = await request.formData();
    } catch (error) {
      if (isPatternError(error)) {
        throw new ApiInputError("Safari n’a pas pu préparer l’enregistrement audio. Relancez la dictée.", 400);
      }
      throw new ApiInputError("Enregistrement audio illisible. Relancez la dictée.", 400);
    }

    const file = input.get("file");
    if (!(file instanceof File)) throw new ApiInputError("Fichier audio manquant.");
    if (file.size === 0) throw new ApiInputError("Le fichier audio est vide.");
    if (file.size > MAX_AUDIO_BYTES) {
      throw new ApiInputError("Le segment audio dépasse 24 Mo. Relancez la dictée.", 413);
    }
    if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type.toLowerCase())) {
      throw new ApiInputError("Format audio non pris en charge.");
    }

    const data = await groqTranscription(file, apiKey);
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
      text: String(data.text ?? "").trim().slice(0, 30_000),
      language: data.language ?? "fr",
      duration: data.duration ?? null,
      lowConfidenceSegments,
      segments,
    });
  } catch (error) {
    return errorResponse(error, "Transcription impossible.");
  }
}
