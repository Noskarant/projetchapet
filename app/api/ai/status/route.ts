import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      groq: Boolean(process.env.GROQ_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      transcriptionModel:
        process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
      structuringModel: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
