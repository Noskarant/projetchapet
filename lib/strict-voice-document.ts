export type StrictVoiceUnit = "m2" | "m" | "l" | "h" | "forfait" | "unite";

export type StrictVoiceService = {
  designation: string;
  quantite: number | null;
  unite: StrictVoiceUnit | null;
  prix_unitaire_ht: number | null;
  taux_tva: number | null;
};

export type StrictVoiceDocument = {
  client: { nom: string };
  prestations: StrictVoiceService[];
};

export type ContextClientResolution =
  | { status: "missing"; name: "" }
  | { status: "not_found"; name: string }
  | { status: "ambiguous"; name: string }
  | { status: "matched"; name: string };

const TITLES = new Set([
  "m", "mr", "monsieur", "mme", "madame", "mlle", "melle", "mademoiselle",
  "dr", "docteur", "me", "maitre",
]);
const STOPWORDS = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "un", "une"]);
const CORRECTION_TEST = /\b(?:non|attends?|plutot|plutôt|en fait|finalement|je corrige|remplace(?:r)?)\b/iu;
const CANCELLATION_TEST = /\b(?:non\s+oublie|oublie|annule|supprime|retire|enleve|enlève)\b/iu;
const SPOKEN_NUMBERS = new Map([
  ["un", 1],
  ["une", 1],
  ["deux", 2],
  ["trois", 3],
  ["quatre", 4],
  ["cinq", 5],
  ["six", 6],
  ["sept", 7],
  ["huit", 8],
  ["neuf", 9],
  ["dix", 10],
]);

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/\s/g, "").replace(",", "."))
      : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(1_000_000_000, Math.max(0, parsed)) : 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSpokenText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityTokens(value: string) {
  const tokens = normalizeSpokenText(value).split(" ").filter(Boolean);
  while (tokens.length && (TITLES.has(tokens[0]) || /^client/.test(tokens[0]))) tokens.shift();
  if (tokens[0] === "et" && TITLES.has(tokens[1] ?? "")) tokens.splice(0, 2);
  return tokens.filter((token) => !STOPWORDS.has(token));
}

function phonetic(value: string) {
  return normalizeSpokenText(value)
    .replace(/eaux|aux|eau|au/g, "o")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/qu|ck|c(?=[aou])/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/gn/g, "n")
    .replace(/ill/g, "y")
    .replace(/ou/g, "u")
    .replace(/ain|ein|in|yn|im/g, "1")
    .replace(/an|en|am|em/g, "2")
    .replace(/on|om/g, "3")
    .replace(/ai|ei|er|ez/g, "e")
    .replace(/[hwy]/g, "")
    .replace(/([a-z0-9])\1+/g, "$1")
    .replace(/[sxztdpg]$/g, "");
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return row[right.length];
}

function tokenScore(left: string, right: string) {
  const a = phonetic(left);
  const b = phonetic(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function nameScore(hint: string, candidate: string) {
  const hintTokens = identityTokens(hint);
  const candidateTokens = identityTokens(candidate);
  if (!hintTokens.length || !candidateTokens.length) return 0;
  if (hintTokens.join(" ") === candidateTokens.join(" ")) return 1;

  const shorter = hintTokens.length <= candidateTokens.length ? hintTokens : candidateTokens;
  const longer = hintTokens.length <= candidateTokens.length ? candidateTokens : hintTokens;
  if (shorter.some((token) => token.length >= 4) && shorter.every((token) => longer.some((other) => token === other || tokenScore(token, other) >= 0.9))) {
    return 0.93;
  }

  const forward = hintTokens.map((token) => Math.max(...candidateTokens.map((other) => tokenScore(token, other))));
  const reverse = candidateTokens.map((token) => Math.max(...hintTokens.map((other) => tokenScore(token, other))));
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.min(average(forward), average(reverse) * 0.94);
}

export function sanitizeContextClients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, 180)).filter(Boolean))].slice(0, 300);
}

export function resolveContextClient(contextClients: string[], spokenName: string): ContextClientResolution {
  const name = text(spokenName, 180);
  if (!name) return { status: "missing", name: "" };
  if (!contextClients.length) return { status: "not_found", name };

  const scores = contextClients
    .map((candidate) => ({ candidate, score: nameScore(name, candidate) }))
    .filter(({ score }) => score >= 0.8)
    .sort((a, b) => b.score - a.score);
  if (!scores.length) return { status: "not_found", name };
  if (scores[0].score < 0.86 || (scores[1] && scores[0].score - scores[1].score < 0.075)) {
    return { status: "ambiguous", name };
  }
  return { status: "matched", name: scores[0].candidate };
}

function unit(value: unknown): StrictVoiceUnit | null {
  const normalized = normalizeSpokenText(text(value, 30));
  if (!normalized) return null;
  if (/^(?:m2|m 2|metre carre|metres carres)$/.test(normalized)) return "m2";
  if (/^(?:m|ml|metre|metres|metre lineaire|metres lineaires)$/.test(normalized)) return "m";
  if (/^(?:l|litre|litres)$/.test(normalized)) return "l";
  if (/^(?:h|heure|heures)$/.test(normalized)) return "h";
  if (/^forfait/.test(normalized)) return "forfait";
  return "unite";
}

function serviceKey(value: string) {
  return identityTokens(value)
    .filter((token) => !["pose", "fourniture", "travaux", "prestation"].includes(token))
    .join(" ");
}

function normalizeService(raw: unknown): StrictVoiceService | null {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const designation = text(value.designation, 240);
  const quantite = optionalNumber(value.quantite);
  const price = optionalNumber(value.prix_unitaire_ht);
  const tax = optionalNumber(value.taux_tva);
  if (!designation && quantite === null && price === null) return null;
  return {
    designation,
    quantite,
    unite: value.unite ? unit(value.unite) : null,
    prix_unitaire_ht: price,
    taux_tva: tax !== null && [0, 5.5, 10, 20].includes(tax) ? tax : null,
  };
}

export function normalizeStrictVoiceDocument(raw: unknown, contextClients: string[] = []): StrictVoiceDocument {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawClient = value.client && typeof value.client === "object" ? value.client as Record<string, unknown> : {};
  const spokenName = text(rawClient.nom, 180);
  const resolution = resolveContextClient(contextClients, spokenName);
  const prestations = (Array.isArray(value.prestations) ? value.prestations.slice(0, 50) : [])
    .map(normalizeService)
    .filter((entry): entry is StrictVoiceService => Boolean(entry));

  const finalServices = new Map<string, StrictVoiceService>();
  prestations.forEach((service, index) => {
    const key = serviceKey(service.designation) || `ligne-${index}`;
    finalServices.delete(key);
    finalServices.set(key, service);
  });

  return {
    client: { nom: resolution.status === "matched" ? resolution.name : spokenName },
    prestations: [...finalServices.values()],
  };
}

export function strictDocumentToLegacy(document: StrictVoiceDocument) {
  const computedTitle = document.prestations.length > 1
    ? (document.prestations.some((item) => /peint|mur|plafond|plinth|papier|enduit|protection/i.test(item.designation)) ? "Travaux de peinture intérieure" : "Travaux à préciser")
    : document.prestations[0]?.designation || "Travaux à préciser";
  const legacy = {
    customer_hint: document.client.nom,
    title: document.prestations[0]?.designation || "Travaux à préciser",
    site_address: "",
    notes: "",
    items: document.prestations.map((service) => ({
      label: service.designation,
      description: "",
      quantity: service.quantite,
      unit: service.unite === "m2" ? "m²" : service.unite === "m" ? "ml" : service.unite === "unite" ? "u" : service.unite,
      unit_price: service.prix_unitaire_ht,
      tax_rate: service.taux_tva,
      price_type: "ht",
      confidence: 1,
    })),
    warnings: [],
  };
  return { ...legacy, title: computedTitle };
}

export function filterSpeechNoise(value: string) {
  return value
    .replace(/\b(?:euh+|heu+|hum+|ben|bah|bref|voila|voilà|du coup|tu vois|en gros|quoi)\b/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function segments(value: string) {
  return filterSpeechNoise(value)
    .replace(/\b(?:non\s+(?:attends?|oublie|finalement)|attends?\s+(?:plutot|plutôt)|en fait|finalement|je corrige|remplace(?:r)?|plutot|plutôt)\b/giu, (match) => `|||${match}`)
    .split(/\|\|\||[.;]+|\b(?:ensuite|puis)\b/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function quantityFrom(segment: string) {
  const numeric = segment.match(/(\d+(?:[,.]\d+)?)\s*(m2|m²|mètres?\s+carrés?|ml|mètres?\s+linéaires?|mètres?|m|litres?|l|heures?|h|unités?|u|forfaits?)/iu);
  if (numeric) return { value: number(numeric[1]), unit: unit(numeric[2]), raw: numeric[0] };
  const correction = normalizeSpokenText(segment).match(/\bqu\s+(un|une)\b/);
  if (correction) return { value: SPOKEN_NUMBERS.get(correction[1]) ?? 1, unit: "unite" as const, raw: correction[0] };
  const spoken = segment.match(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(portes?|unités?|unites?|couches?|forfaits?|heures?)\b/iu);
  if (!spoken) return null;
  const normalizedNumber = normalizeSpokenText(spoken[1]);
  const normalizedUnit = normalizeSpokenText(spoken[2]);
  return {
    value: SPOKEN_NUMBERS.get(normalizedNumber) ?? null,
    unit: /^forfait/.test(normalizedUnit) ? "forfait" as const : /^heure/.test(normalizedUnit) ? "h" as const : "unite" as const,
    raw: spoken[1],
  };
}

function priceFrom(segment: string) {
  const matches = [...segment.matchAll(/(?:à|a|pour|prix(?:\s+unitaire)?(?:\s+de)?|de)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(?:ht)?/giu)];
  const match = matches.at(-1);
  return match ? { value: number(match[1]), raw: match[0] } : null;
}

function taxFrom(segment: string, fallback: number) {
  const match = [...segment.matchAll(/tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)].at(-1);
  return match ? number(match[1]) : fallback;
}

function designationFrom(segment: string, quantityRaw = "", priceRaw = "") {
  return segment
    .replace(/\bclient(?:e)?\s+[^,.;]+[,;]?/giu, " ")
    .replace(/\b(?:avec|pour)\s+(?:(?:m(?:onsieur)?|mr|mme|madame|mlle|mademoiselle)\.?\s+)[^,.;]+[,;]?/giu, " ")
    .replace(/\b(?:non\s+oublie|oublie|annule|supprime|retire|enleve|enlève)\b/giu, " ")
    .replace(/\b(?:non|attends?|plutot|plutôt|en fait|finalement|je corrige|remplace(?:r)?)\b/giu, " ")
    .replace(/\b(?:ajoute|ajouter|mets|mettre|ligne|prestation|article|devis|facture)\b/giu, " ")
    .replace(quantityRaw, " ")
    .replace(priceRaw, " ")
    .replace(/tva\s*(?:à|a|de)?\s*(?:5[,.]5|10|20|0)\s*%?/giu, " ")
    .replace(/\b(?:au prix|prix unitaire|ht|euros?)\b/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-,:\s]+|[-,:\s]+$/g, "")
    .trim()
    .slice(0, 240);
}

function closestIndex(prestations: StrictVoiceService[], designation: string) {
  const key = serviceKey(designation);
  if (!key) return prestations.length - 1;
  let index = -1;
  let best = 0;
  prestations.forEach((service, current) => {
    const score = nameScore(key, serviceKey(service.designation));
    if (score > best) {
      best = score;
      index = current;
    }
  });
  return best >= 0.72 ? index : -1;
}

function lastClient(spokenSegments: string[], contextClients: string[]) {
  let current = "";
  for (const segment of spokenSegments) {
    const explicit = [...segment.matchAll(/\b(?:client(?:e)?|avec|pour)\s+(.+?)(?=\s+(?:ajoute|mets|peinture|pose|fourniture|depose|dépose|tva|\d)|[,.;]|$)/giu)].at(-1)?.[1]?.trim();
    if (!explicit) continue;
    if (/\btva\b/iu.test(explicit)) continue;
    const tokens = identityTokens(explicit);
    const hasTitle = TITLES.has(normalizeSpokenText(explicit).split(" ").filter(Boolean)[0] ?? "");
    if (tokens.length >= 2 || (hasTitle && tokens.length >= 1)) current = explicit;
  }
  const resolution = resolveContextClient(contextClients, current);
  return resolution.status === "matched" ? resolution.name : current;
}

export function fallbackStrictVoiceDocument(transcript: string, contextClients: string[] = []): StrictVoiceDocument {
  const spokenSegments = segments(transcript);
  const prestations: StrictVoiceService[] = [];
  let tax = number([...transcript.matchAll(/tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)].at(-1)?.[1] ?? 0);
  let pendingCorrectionTarget = "";

  for (const segment of spokenSegments) {
    tax = taxFrom(segment, tax);
    const quantity = quantityFrom(segment);
    const price = priceFrom(segment);
    const cancellation = CANCELLATION_TEST.test(segment);
    const correction = CORRECTION_TEST.test(segment);
    const targetMention = segment.match(/\bpour\s+les?\s+([^,.;]+?)(?=[,.;]|$)/iu)?.[1]?.trim() ?? "";
    let designation = designationFrom(segment, quantity?.raw, price?.raw);
    if (!quantity && !price && targetMention) {
      pendingCorrectionTarget = targetMention;
      continue;
    }
    const correctionTarget = correction && (targetMention || pendingCorrectionTarget);
    if (correctionTarget) designation = correctionTarget;

    if (cancellation) {
      const index = closestIndex(prestations, designation);
      if (index >= 0) prestations.splice(index, 1);
      continue;
    }
    if (!designation && !quantity && !price) continue;

    if (correction && prestations.length) {
      const found = closestIndex(prestations, designation);
      const index = found >= 0 ? found : prestations.length - 1;
      const previous = prestations[index];
      prestations[index] = {
        designation: designation || previous.designation,
        quantite: quantity?.value ?? previous.quantite,
        unite: quantity?.unit ?? previous.unite,
        prix_unitaire_ht: price?.value ?? previous.prix_unitaire_ht,
        taux_tva: tax || previous.taux_tva,
      };
      pendingCorrectionTarget = "";
      continue;
    }

    const service: StrictVoiceService = {
      designation: designation || "Prestation dictée",
      quantite: quantity?.value ?? null,
      unite: quantity?.unit ?? null,
      prix_unitaire_ht: price?.value ?? null,
      taux_tva: tax || null,
    };
    const existing = prestations.findIndex((entry) => serviceKey(entry.designation) === serviceKey(service.designation));
    if (existing >= 0) prestations.splice(existing, 1);
    prestations.push(service);
  }

  return normalizeStrictVoiceDocument({
    client: { nom: lastClient(spokenSegments, contextClients) },
    prestations,
  }, contextClients);
}
