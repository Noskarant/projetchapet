import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY non configurée.", configured: false }, { status: 503 });

    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });

    const form = new FormData();
    form.append("file", file, file.name || "dictation.webm");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "json");
    form.append("temperature", "0");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? `Groq API : ${response.status}`);
    return NextResponse.json({ provider: "groq-whisper-large-v3-turbo", text: data.text ?? "" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transcription impossible." }, { status: 500 });
  }
}
