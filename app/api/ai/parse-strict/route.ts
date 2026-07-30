import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { robustArtisanDictation } from "@/lib/robust-artisan-dictation";
import {
  normalizeStrictVoiceDocument,
  sanitizeContextClients,
  strictDocumentToLegacy,
} from "@/lib/strict-voice-document";

function systemPrompt(contextClients: string[]) {
  const clientContext = contextClients.length
    ? `\ncontext_clients disponibles (recopie exactement le nom canonique uniquement en cas de correspondance unique et sûre) :\n${JSON.stringify(contextClients)}`
    : "\nAucun context_clients n’est fourni.";

  return `Tu es un extracteur déterministe de dictées françaises pour devis et factures d’artisans.
Tu dois appliquer ces règles dans cet ordre, sans exception.

1. CORRESPONDANCE CLIENT ET NOMS PROPRES
- Lorsque context_clients est fourni, rattache les erreurs de transcription à un seul client existant par correspondance phonétique stricte.
- Tolère les variantes de civilité, accents, traits d’union et ponctuation : M./Monsieur, Mme/Madame, Mlle/Mademoiselle.
- Tolère une partie distinctive d’un nom composé uniquement si une seule fiche peut correspondre.
- En cas de doute entre plusieurs clients, n’en choisis aucun : conserve le dernier nom réellement prononcé.
- Si plusieurs clients sont cités puis corrigés, ne conserve que le dernier client final énoncé.

2. REPRISES, CORRECTIONS ET ANNULATIONS
- Traite la dictée chronologiquement.
- La dernière instruction sur une ligne, une désignation, un prix, une quantité, une surface, une unité ou une TVA annule et remplace immédiatement toute valeur précédente visant la même prestation.
- « non », « attends », « en fait », « finalement », « plutôt », « je corrige » et « remplace » introduisent une correction.
- « non oublie », « oublie », « annule », « supprime », « retire » et « enlève » suppriment totalement la ligne ou le montant visé.
- Une prestation annulée ne doit jamais apparaître dans le JSON final, même avec une quantité ou un prix à zéro.
- N’ajoute jamais simultanément l’ancienne et la nouvelle version d’une même ligne.

3. BRUIT ET PARLÉ PARASITE
- Ignore totalement les bruits, hésitations et tics de langage : euh, heu, hum, ben, bah, bref, voilà, du coup, tu vois, quoi.
- Ignore les phrases sans rapport avec le devis.
- N’utilise aucune phrase parasite comme désignation ou note.

4. DONNÉES MÉTIER
- N’invente aucune prestation, quantité, unité, valeur, TVA ou client.
- Les prix sont des prix unitaires HT. Si une valeur TTC est prononcée sans information suffisante pour la convertir, mets 0.
- Convertis les unités exclusivement vers : m2, m, l, h, forfait ou unite.
- Chaque prestation finale distincte apparaît une seule fois.
- Une TVA globale s’applique à toutes les lignes sauf lorsqu’une exception explicite vise une prestation précise.
- Pour un forfait annoncé pour plusieurs portes, conserve une quantité de 1, l’unité forfait et mentionne le nombre de portes dans la désignation.

FORMAT DE SORTIE OBLIGATOIRE
Réponds uniquement avec cet objet JSON, sans markdown, sans commentaire et sans propriété supplémentaire :
{
  "client": { "nom": "string" },
  "prestations": [
    {
      "designation": "string",
      "quantite": 0,
      "unite": "m2|m|l|h|forfait|unite",
      "prix_unitaire_ht": 0,
      "taux_tva": 0
    }
  ]
}
${clientContext}`;
}

function fallbackPayload(transcript: string, contextClients: string[], reason?: string) {
  const strictData = robustArtisanDictation(transcript, contextClients);
  return NextResponse.json({
    provider: reason ? "local-recovery-strict" : "local-fallback-strict",
    strict_data: strictData,
    data: strictDocumentToLegacy(strictData),
    warning: reason || null,
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-parse-strict", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      transcript?: unknown;
      target?: unknown;
      context_clients?: unknown;
    }>(request, 30_000);

    if (typeof body.transcript !== "string") throw new ApiInputError("La dictée est invalide.");
    const transcript = body.transcript.trim();
    if (!transcript) throw new ApiInputError("La dictée est vide.");
    if (transcript.length > 14_000) throw new ApiInputError("La dictée est trop longue.", 413);

    const contextClients = sanitizeContextClients(body.context_clients);
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) return fallbackPayload(transcript, contextClients);

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
          max_tokens: 2600,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(contextClients) },
            {
              role: "user",
              content: JSON.stringify({
                context_clients: contextClients,
                transcription: transcript,
              }),
            },
          ],
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? `DeepSeek API : ${response.status}`);
      const content = result?.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek n’a retourné aucune donnée.");

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        throw new Error("DeepSeek a retourné un JSON invalide.");
      }

      const strictData = normalizeStrictVoiceDocument(raw, contextClients);
      const fallback = robustArtisanDictation(transcript, contextClients);
      const finalData = strictData.prestations.length ? strictData : fallback;

      return NextResponse.json({
        provider: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        mode: "strict-non-thinking",
        strict_data: finalData,
        data: strictDocumentToLegacy(finalData),
        usage: result?.usage ?? null,
      });
    } catch {
      return fallbackPayload(
        transcript,
        contextClients,
        "L’analyse en ligne a été remplacée automatiquement par l’analyse locale fiable.",
      );
    }
  } catch (error) {
    return errorResponse(error, "Analyse stricte impossible.");
  }
}
