import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { robustArtisanDictation } from "@/lib/robust-artisan-dictation";
import {
  normalizeStrictVoiceDocument,
  sanitizeContextClients,
  strictDocumentToLegacy,
} from "@/lib/strict-voice-document";

export const runtime = "nodejs";
export const maxDuration = 300;

type StrictDocument = ReturnType<typeof robustArtisanDictation>;

function normalizeSemanticText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceServices(
  services: StrictDocument["prestations"],
  matches: (label: string) => boolean,
  replacement: StrictDocument["prestations"][number],
) {
  const firstIndex = services.findIndex((service) => matches(normalizeSemanticText(service.designation)));
  const filtered = services.filter((service) => !matches(normalizeSemanticText(service.designation)));
  const insertionIndex = firstIndex >= 0 ? Math.min(firstIndex, filtered.length) : filtered.length;
  filtered.splice(insertionIndex, 0, replacement);
  return filtered;
}

function semanticServiceFamily(value: string) {
  const label = normalizeSemanticText(value);

  if (/\bprotection\b/u.test(label) && /\bchantier\b/u.test(label)) return "site-protection";
  if (/\bprotection\b/u.test(label) && /\bsol\b/u.test(label)) return "floor-protection";
  if (/\benduit\b/u.test(label) && /\bcouloir\b/u.test(label)) return "corridor-plaster";
  if (/\bpapier\s+peint\b/u.test(label)) return "wallpaper";
  if (/\bplafond\b/u.test(label)) return "ceiling";
  if (/\bplinthes?\b/u.test(label)) return "plinths";
  if (/\bportes?\b/u.test(label)) return "doors";
  if (/\bchambre\b/u.test(label) && /\b(?:preparation|peinture|repeinture|repeindre)\b/u.test(label)) return "bedroom-walls";
  if (/\bmurs?\b/u.test(label) && /\b(?:preparation|peinture|murale)\b/u.test(label)) return "main-walls";
  if (/\bsous\s+couche\b/u.test(label)) return "undercoat";
  if (/\bfinition\b/u.test(label)) return "finishing";
  if (/\bmain\s+d\s+oeuvre\b|\bmo\b/u.test(label)) return "labour";

  return "";
}

function sameDeterministicService(
  left: StrictDocument["prestations"][number],
  right: StrictDocument["prestations"][number],
) {
  const leftFamily = semanticServiceFamily(left.designation);
  const rightFamily = semanticServiceFamily(right.designation);
  if (leftFamily && rightFamily) return leftFamily === rightFamily;
  return normalizeSemanticText(left.designation) === normalizeSemanticText(right.designation);
}

function reconcileDeterministicSemantics(
  transcript: string,
  aiData: StrictDocument,
  deterministicData: StrictDocument,
  contextClients: string[],
) {
  if (!aiData.prestations.length) return deterministicData;

  const spoken = normalizeSemanticText(transcript);
  let prestations = [...aiData.prestations];

  const explicitlyRemovesWallpaper = /\b(?:enlever|deposer|retirer)\b.{0,80}\b(?:ancien\s+)?papier\s+peint\b/u.test(spoken);
  if (explicitlyRemovesWallpaper) {
    const deterministicWallpaper = deterministicData.prestations.find((service) => {
      const label = normalizeSemanticText(service.designation);
      return /\bpapier\s+peint\b/u.test(label) && /\b(?:depose|enlevement|retrait)\b/u.test(label);
    });
    if (deterministicWallpaper) {
      prestations = replaceServices(
        prestations,
        (label) => /\bpapier\s+peint\b/u.test(label),
        deterministicWallpaper,
      );
    }
  }

  const explicitlyPricesPreparationAndTwoCoatsTogether = /\bprepar(?:er|ation)\b.{0,100}\bmurs?\b.{0,140}\b(?:deux|2)\s+couches?\b.{0,80}\bpeinture\b/u.test(spoken);
  if (explicitlyPricesPreparationAndTwoCoatsTogether) {
    const deterministicWalls = deterministicData.prestations.find((service) => {
      const label = normalizeSemanticText(service.designation);
      return /\bpreparation\b/u.test(label)
        && /\bmurs?\b/u.test(label)
        && /\b(?:deux|2)\s+couches?\b/u.test(label)
        && /\bpeinture\b/u.test(label);
    });
    if (deterministicWalls && deterministicWalls.quantite !== null && deterministicWalls.prix_unitaire_ht !== null) {
      prestations = replaceServices(
        prestations,
        (label) => {
          if (/\bchambre\b|\bcouloir\b/u.test(label)) return false;
          const standalonePreparation = /\bpreparation\b/u.test(label) && /\bmurs?\b/u.test(label);
          const wallPainting = /\bpeinture\b/u.test(label)
            && /\bmurs?\b/u.test(label)
            && (/\b(?:deux|2)\s+couches?\b/u.test(label) || /\bsalon\b/u.test(label));
          return standalonePreparation || wallPainting;
        },
        deterministicWalls,
      );
    }
  }

  // Le parseur local ne devine rien : lorsqu'il a réussi à extraire une prestation,
  // ses valeurs proviennent directement de la dictée. Il devient donc la source de
  // vérité pour cette famille de prestation. L'IA peut enrichir les métiers que le
  // parseur local ne reconnaît pas, mais elle ne peut ni supprimer une ligne locale,
  // ni remplacer un prix/une quantité/une TVA explicites par une autre valeur.
  const aiOnlyServices = prestations.filter((aiService) => (
    !deterministicData.prestations.some((deterministicService) => (
      sameDeterministicService(aiService, deterministicService)
    ))
  ));

  const clientName = deterministicData.client.nom || aiData.client.nom;
  return normalizeStrictVoiceDocument({
    client: { nom: clientName },
    prestations: [...deterministicData.prestations, ...aiOnlyServices],
  }, contextClients);
}

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
- Traite toute la dictée chronologiquement, même lorsqu’elle est longue.
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
- Les prix sont des prix unitaires HT. Si une valeur TTC est prononcée sans information suffisante pour la convertir, mets null.
- Une valeur inconnue reste null. N'utilise jamais 0, 1, "unite" ou "forfait" comme valeur de compatibilité.
- Un prix explicitement dicté à 0 euro, offert ou gratuit est une vraie valeur et doit rester 0.
- Convertis les unités exclusivement vers : m2, m, l, h, forfait ou unite.
- Chaque prestation finale distincte apparaît une seule fois.
- Respecte strictement le sens du verbe dicté : « enlever », « déposer » ou « retirer » un ancien papier peint signifie une DÉPOSE/UN ENLÈVEMENT, jamais une pose de papier peint.
- Lorsque l’artisan enchaîne plusieurs opérations comme « préparer les murs puis faire deux couches de peinture » et donne ensuite une seule quantité et un seul prix pour cet ensemble, crée UNE SEULE ligne combinée couvrant les opérations. Ne crée pas une ligne de préparation séparée à prix inconnu ou nul.
- Une TVA globale s’applique à toutes les lignes sauf lorsqu’une exception explicite vise une prestation précise.
- Pour des portes annoncées à un prix unitaire, conserve le nombre final de portes en quantité, l'unité unite, et le prix unitaire dicté. Une correction de quantité ne modifie jamais le prix unitaire.

FORMAT DE SORTIE OBLIGATOIRE
Réponds uniquement avec cet objet JSON, sans markdown, sans commentaire et sans propriété supplémentaire :
{
  "client": { "nom": "string" },
  "prestations": [
    {
      "designation": "string",
      "quantite": null,
      "unite": null,
      "prix_unitaire_ht": null,
      "taux_tva": null
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
  const limited = rateLimit(request, "ai-parse-strict", 60);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      transcript?: unknown;
      target?: unknown;
      context_clients?: unknown;
    }>(request, 140_000);

    if (typeof body.transcript !== "string") throw new ApiInputError("La dictée est invalide.");
    const transcript = body.transcript.trim();
    if (!transcript) throw new ApiInputError("La dictée est vide.");
    if (transcript.length > 80_000) throw new ApiInputError("La dictée dépasse la capacité d’un seul devis.", 413);

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
          max_tokens: 7000,
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
      const finalData = reconcileDeterministicSemantics(transcript, strictData, fallback, contextClients);

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
