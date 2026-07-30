import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { normalizeAgendaVoiceData, parseAgendaVoiceRequest } from "@/lib/mobile-agenda-voice";

function parisDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function systemPrompt(referenceDate: string) {
  return `Tu extrais un événement d'agenda pour un artisan français.
La date de référence en Europe/Paris est ${referenceDate}. Résous précisément les expressions comme aujourd'hui, demain, après-demain, mardi, mardi prochain, la semaine prochaine ou une date prononcée.
N'invente jamais un client, une date, une heure, un lieu ou une consigne. Conserve les termes prononcés. Si une donnée est absente ou ambiguë, laisse-la vide et ajoute un avertissement.

Le champ type doit être exactement l'une de ces valeurs :
- Chantier : rendez-vous, visite, intervention, réunion ou tâche chantier ;
- Commande : commande ou récupération de fournitures ;
- Facturation : émission ou préparation d'une facture ;
- Relance : appel, rappel ou relance d'un client.

Réponds uniquement avec ce JSON strict :
{
  "customer_hint":"",
  "title":"",
  "date":"YYYY-MM-DD",
  "time":"HH:MM",
  "location":"",
  "type":"Chantier|Commande|Facturation|Relance",
  "warnings":[""]
}`;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-agenda", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{ transcript?: unknown }>(request, 20_000);
    if (typeof body.transcript !== "string") throw new ApiInputError("La dictée est invalide.");
    const transcript = body.transcript.trim();
    if (!transcript) throw new ApiInputError("La dictée est vide.");
    if (transcript.length > 8_000) throw new ApiInputError("La dictée est trop longue.", 413);

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        provider: "local-fallback",
        data: parseAgendaVoiceRequest(transcript),
      });
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        thinking: { type: "disabled" },
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(parisDate()) },
          { role: "user", content: transcript },
        ],
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message ?? `DeepSeek API : ${response.status}`);
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek n’a retourné aucune donnée.");

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error("DeepSeek a retourné un JSON invalide.");
    }

    return NextResponse.json({
      provider: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      mode: "non-thinking",
      data: normalizeAgendaVoiceData(raw, transcript),
      usage: result?.usage ?? null,
    });
  } catch (error) {
    return errorResponse(error, "Analyse de l’agenda impossible.");
  }
}
