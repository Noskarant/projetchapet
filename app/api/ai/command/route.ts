import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import {
  fallbackMobileVoiceCommand,
  sanitizeMobileVoiceCommand,
  type VoiceEntityKind,
} from "@/lib/mobile-voice-command";
import type {
  MobileAgendaEntry,
  MobileCustomer,
  MobileInvoice,
  MobileQuote,
  MobileWorkspace,
} from "@/lib/mobile-prototype";

export const runtime = "nodejs";
export const maxDuration = 120;

type TargetData = MobileQuote | MobileInvoice | MobileAgendaEntry | MobileCustomer;

type CommandBody = {
  transcript?: unknown;
  target?: {
    entity?: unknown;
    id?: unknown;
    data?: unknown;
  };
  workspace?: unknown;
};

function validEntity(value: unknown): value is VoiceEntityKind {
  return value === "quote" || value === "invoice" || value === "agenda" || value === "customer";
}

function safeWorkspace(value: unknown): MobileWorkspace {
  const raw = value && typeof value === "object" ? value as Partial<MobileWorkspace> : {};
  return {
    customers: Array.isArray(raw.customers) ? raw.customers.slice(0, 500) : [],
    quotes: Array.isArray(raw.quotes) ? raw.quotes.slice(0, 500) : [],
    invoices: Array.isArray(raw.invoices) ? raw.invoices.slice(0, 500) : [],
    agenda: Array.isArray(raw.agenda) ? raw.agenda.slice(0, 1000) : [],
  };
}

function systemPrompt(entity: VoiceEntityKind) {
  return `Tu modifies un élément existant d'un logiciel de devis/facturation pour artisans français.

RÈGLES ABSOLUES
- Tu ne crées jamais un nouvel élément : tu modifies uniquement l'identifiant fourni.
- Tu ne changes que ce qui est explicitement demandé dans la dictée.
- Toute reprise orale remplace l'instruction précédente : « non », « attends », « finalement », « plutôt », « je corrige ».
- Toute annulation supprime l'opération visée : « oublie », « supprime », « retire », « enlève ».
- Ignore les hésitations, bruits et phrases hors sujet.
- Pour un client, utilise exclusivement un customer_id présent dans workspace.customers et seulement en cas de correspondance unique.
- Pour une ligne de devis/facture, utilise line_operations avec un match assez précis pour retrouver la ligne existante.
- Une suppression de ligne exige une demande explicite.
- N'invente jamais un prix, une quantité, une TVA, une date, un statut ou un client.
- Les dates sont au format YYYY-MM-DD et les heures au format HH:MM.
- L'entité doit rester « ${entity} » et l'id doit rester celui reçu.

FORMAT JSON STRICT, SANS MARKDOWN :
{
  "entity": "quote|invoice|agenda|customer",
  "id": "identifiant inchangé",
  "summary": "résumé français court des changements",
  "changes": {
    "customer_id": "optionnel",
    "customer_name": "optionnel",
    "title": "optionnel",
    "notes": "optionnel",
    "status": "optionnel",
    "issue_date": "optionnel",
    "expiry_date": "optionnel",
    "due_date": "optionnel",
    "paid_total": 0,
    "date": "optionnel",
    "time": "optionnel",
    "type": "optionnel",
    "done": false,
    "company_name": "optionnel",
    "civility": "optionnel",
    "last_name": "optionnel",
    "first_name": "optionnel",
    "email": "optionnel",
    "phone": "optionnel",
    "address": "optionnel",
    "postal_code": "optionnel",
    "city": "optionnel",
    "siret": "optionnel",
    "vat": "optionnel"
  },
  "line_operations": [
    {
      "action": "add|update|delete",
      "match": "désignation existante visée",
      "designation": "optionnel",
      "description": "optionnel",
      "quantite": 0,
      "unite": "optionnel",
      "prix_unitaire_ht": 0,
      "taux_tva": 0
    }
  ]
}

Supprime du JSON toutes les propriétés non demandées. Pour agenda et customer, line_operations doit être vide.`;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-command", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<CommandBody>(request, 180_000);
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) throw new ApiInputError("La commande vocale est vide.");
    if (transcript.length > 80_000) throw new ApiInputError("La commande vocale est trop longue.", 413);

    const entity = body.target?.entity;
    const id = body.target?.id;
    if (!validEntity(entity) || typeof id !== "string" || !id) {
      throw new ApiInputError("L’élément à modifier est introuvable.");
    }

    const workspace = safeWorkspace(body.workspace);
    const data = body.target?.data as TargetData;
    const target = { entity, id, data };
    const fallback = fallbackMobileVoiceCommand(transcript, target, workspace);
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ provider: "local-voice-command", data: fallback });

    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
          thinking: { type: "disabled" },
          max_tokens: 3500,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(entity) },
            {
              role: "user",
              content: JSON.stringify({
                transcription: transcript,
                target: { entity, id, data },
                workspace: {
                  customers: workspace.customers.map((customer) => ({
                    id: customer.id,
                    kind: customer.kind,
                    name: customer.kind === "Professionnel"
                      ? customer.companyName
                      : [customer.civility, customer.lastName, customer.firstName].filter(Boolean).join(" "),
                    siret: customer.siret,
                    city: customer.city,
                  })),
                },
              }),
            },
          ],
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || "Analyse indisponible.");
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("Réponse vide.");
      const parsed = JSON.parse(content) as unknown;
      const command = sanitizeMobileVoiceCommand(parsed, fallback);
      command.entity = entity;
      command.id = id;
      return NextResponse.json({
        provider: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        data: command,
      });
    } catch {
      return NextResponse.json({
        provider: "local-voice-command-recovery",
        data: fallback,
        warning: "Analyse locale utilisée automatiquement.",
      });
    }
  } catch (error) {
    return errorResponse(error, "Commande vocale impossible.");
  }
}
