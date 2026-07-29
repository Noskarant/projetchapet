import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BTP_PROMPT =
  "Dictée professionnelle d'un artisan français du bâtiment. Vocabulaire possible : devis, facture, client, chantier, plâtrerie, peinture, ratissage, rebouchage, ponçage, impression, sous-couche, deux passes, préparation des supports, protection, fourniture et pose, dépose, évacuation, mètre carré, mètre linéaire, forfait, heure, TVA, HT, TTC, franchise, RSE, SIRET.";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY non configurée.", configured: false },
        { status: 503 },
      );
    }

    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Le fichier audio est vide." }, { status: 400 });
    }
    if (file.size > 24 * 1024 * 1024) {
      return NextResponse.json(
        { error: "La dictée dépasse 24 Mo. Enregistrez-la en plusieurs parties." },
        { status: 413 },
      );
    }

    const form = new FormData();
    form.append("file", file, file.name || "dictee.webm");
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

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Groq API : ${response.status}`);
    }

    const segments = Array.isArray(data.segments)
      ? data.segments.map((segment: Record<string, unknown>) => ({
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
      return (Number.isFinite(probability) && probability < -0.55) ||
        (Number.isFinite(noSpeech) && noSpeech > 0.45);
    }).length;

    return NextResponse.json({
      provider: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
      text: String(data.text ?? "").trim(),
      language: data.language ?? "fr",
      duration: data.duration ?? null,
      lowConfidenceSegments,
      segments,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription impossible." },
      { status: 500 },
    );
  }
}
