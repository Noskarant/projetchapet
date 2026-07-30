export type StrictVoiceUnit = "m2" | "m" | "l" | "h" | "forfait" | "unite";

export type StrictVoiceService = {
  designation: string;
  quantite: number;
  unite: StrictVoiceUnit;
  prix_unitaire_ht: number;
  taux_tva: number;
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

const TITLE_WORDS = new Set([
  "m",
  "mr",
  "monsieur",
  "mme",
  "madame",
  "mlle",
  "melle",
  "mademoiselle",
  "dr",
  "docteur",
  "me",
  "maitre",
]);

const FILLERS = /\b(?:euh+|heu+|hum+|ben|bah|bref|voila|voilà|du coup|tu vois|en gros|quoi)\b/giu;
const CORRECTION_START = /\b(?:non\s+(?:attends?|oublie|finalement)|attends?\s+(?:plutot|plutôt)|en fait|finalement|je corrige|remplace(?:r)?|plutot|plutôt)\b/giu;
const CANCELLATION = /\b(?:non\s+oublie|oublie|annule|supprime|retire|enleve|enlève)\b/iu;
const CORRECTION = /\b(?:non|attends?|plutot|plutôt|en fait|finalement|je corrige|remplace(?:r)?)\b/iu;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown) {
  const number = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/\s/g, "").replace(",", "."))
      : Number.NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.min(1_000_000_000, Math.max(0, number));
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
  while (tokens.length && (TITLE_WORDS.has(tokens[0]) || tokens[0] === "client" || tokens[0] === "cliente")) {
    tokens.shift();
  }
  if (tokens[0] === "et" && tokens.length > 1 && TITLE_WORDS.has(tokens[1])) tokens.splice(0, 2);
  return tokens;
}

function phoneticToken(value: string) {
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

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return row[right.length];
}

function tokenSimilarity(left: string, right: string) {
  const a = phoneticToken(left);
  const b = phoneticToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function nameScore(hint: string, candidate: string) {
  const hintTokens = identityTokens(hint);
  const candidateTokens = identityTokens(candidate);
  if (!hintTokens.length || !candidateTokens.length) return 0;
  const hintName = hintTokens.join(" ");
  const candidateName = candidateTokens.join(" ");
  if (hintName === candidateName) return 1;

  const shorter = hintTokens.length <= candidateTokens.length ? hintTokens : candidateTokens;
  const longer = hintTokens.length <= candidateTokens.length ? candidateTokens : hintTokens;
  const everyTokenIncluded = shorter.every((token) => longer.some((other) => token === other || tokenSimilarity(token, other) >= 0.9));
  if (everyTokenIncluded && shorter.some((token) => token.length >= 4)) return 0.93;

  const similarities = hintTokens.map((token) => Math.max(...candidateTokens.map((other) => tokenSimilarity(token, other))));
  const reverse = candidateTokens.map((token) => Math.max(...hintTokens.map((other) => tokenSimilarity(token, other))));
  const forwardAverage = similarities.reduce((sum, score) => sum + score, 0) / similarities.length;
  const reverseAverage = reverse.reduce((sum, score) => sum + score, 0) / reverse.length;
  return Math.min(forwardAverage, reverseAverage * 0.94);
}

export function sanitizeContextClients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => cleanText(entry, 180)).filter(Boolean))].slice(0, 300);
}

export function resolveContextClient(contextClients: string[], spokenName: string): ContextClientResolution {
  const name = cleanText(spokenName, 180);
  if (!name) return { status: "missing", name: "" };
  if (!contextClients.length) return { status: "not_found", name };

  const scored = contextClients
    .map((candidate) => ({ candidate, score: nameScore(name, candidate) }))
    .filter((entry) => entry.score >= 0.8)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { status: "not_found", name };
  const top = scored[0];
  const second = scored[1];
  if (top.score < 0.86 || (second && top.score - second.score < 0.075)) {
    return { status: "ambiguous", name };
  }
  return { status: "matched", name: top.candidate };
}

function normalizeUnit(value: unknown): StrictVoiceUnit {
  const unit = normalizeSpokenText(cleanText(value, 30));
  if (/^(?:m2|m 2|metre carre|metres carres)$/.test(unit)) return "m2";
  if (/^(?:m|ml|metre|metres|metre lineaire|metres lineaires)$/.test(unit)) return "m";
  if (/^(?:l|litre|litres)$/.test(unit)) return "l";
  if (/^(?:h|heure|heures)$/.test(unit)) return "h";
  if (/^forfait/.test(unit)) return "forfait";
  return "unite";
}

function serviceKey(value: string) {
  return normalizeSpokenText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !["pose", "fourniture", "travaux", "prestation"].includes(token))
    .join(" ");
}

function normalizeService(raw: unknown): StrictVoiceService | null {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const designation = cleanText(value.designation, 240);
  const quantite = cleanNumber(value.quantite);
  const prix = cleanNumber(value.prix_unitaire_ht);
  const tax = cleanNumber(value.taux_tva);
  if (!designation && quantite === 0 && prix === 0) return null;
  return {
    designation,
    quantite,
    unite: normalizeUnit(value.unite),
    prix_unitaire_ht: prix,
    taux_tva: [0, 5.5, 10, 20].includes(tax) ? tax : 0,
  };
}

export function normalizeStrictVoiceDocument(raw: unknown, contextClients: string[] = []): StrictVoiceDocument {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const clientObject = value.client && typeof value.client === "object" ? value.client as Record<string, unknown> : {};
  const spokenName = cleanText(clientObject.nom, 180);
  const resolution = resolveContextClient(contextClients, spokenName);
  const finalName = resolution.status === "matched" ? resolution.name : spokenName;
  const rawServices = Array.isArray(value.prestations) ? value.prestations.slice(0, 50) : [];
  const services = rawServices.map(normalizeService).filter((entry): entry is StrictVoiceService => Boolean(entry));

  // Une même prestation répétée dans la sortie est une reprise : la dernière version remplace l’ancienne.
  const deduplicated = new Map<string, StrictVoiceService>();
  services.forEach((service, index) => {
    const key = serviceKey(service.designation) || `ligne-${index}`;
    if (deduplicated.has(key)) deduplicated.delete(key);
    deduplicated.set(key, service);
  });

  return {
    client: { nom: finalName },
    prestations: [...deduplicated.values()],
  };
}

export function strictDocumentToLegacy(document: StrictVoiceDocument) {
  return {
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
}

export function filterSpeechNoise(value: string) {
  return value
    .replace(FILLERS, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function splitSpokenInstructions(value: string) {
  return filterSpeechNoise(value)
    .replace(CORRECTION_START, (match) => `|||${match}`)
    .split(/\|\|\||[.;]+|\b(?:ensuite|puis)\b/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseQuantity(segment: string) {
  const match = segment.match(/(\d+(?:[,.]\d+)?)\s*(m2|m²|mètres?\s+carrés?|ml|mètres?\s+linéaires?|mètres?|m|litres?|l|heures?|h|unités?|u|forfaits?)/iu);
  if (!match) return null;
  return { value: cleanNumber(match[1]), unit: normalizeUnit(match[2]), raw: match[0] };
}

function parsePrice(segment: string) {
  const matches = [...segment.matchAll(/(?:à|a|pour|prix(?:\s+unitaire)?(?:\s+de)?|de)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(?:ht)?/giu)];
  const match = matches.at(-1);
  return match ? { value: cleanNumber(match[1]), raw: match[0] } : null;
}

function parseTax(segment: string, fallback: number) {
  const matches = [...segment.matchAll(/tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)];
  const value = matches.at(-1)?.[1];
  return value ? cleanNumber(value) : fallback;
}

function cleanDesignation(segment: string, quantityRaw = "", priceRaw = "") {
  return segment
    .replace(CANCELLATION, " ")
    .replace(CORRECTION, " ")
    .replace(/\b(?:client|pour le client|avec|ajoute|ajouter|mets|mettre|ligne|prestation|article|devis|facture)\b/giu, " ")
    .replace(quantityRaw, " ")
    .replace(priceRaw, " ")
    .replace(/tva\s*(?:à|a|de)?\s*(?:5[,.]5|10|20|0)\s*%?/giu, " ")
    .replace(/\b(?:au prix|prix unitaire|ht|euros?)\b/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-,:\s]+|[-,:\s]+$/g, "")
    .trim()
    .slice(0, 240);
}

function extractLastClient(segments: string[], contextClients: string[]) {
  let finalName = "";
  for (const segment of segments) {
    const explicit = [...segment.matchAll(/\b(?:client(?:e)?|avec|pour)\s+(.+?)(?=\s+(?:ajoute|mets|peinture|pose|fourniture|depose|dépose|tva|\d)|[,.;]|$)/giu)].at(-1)?.[1]?.trim() ?? "";
    if (explicit) finalName = explicit;
    const matches = contextClients
      .map((candidate) => ({ candidate, score: nameScore(segment, candidate) }))
      .filter((entry) => entry.score >= 0.9)
      .sort((a, b) => b.score - a.score);
    if (matches[0] && (!matches[1] || matches[0].score - matches[1].score >= 0.075)) finalName = matches[0].candidate;
  }
  const resolution = resolveContextClient(contextClients, finalName);
  return resolution.status === "matched" ? resolution.name : finalName;
}

function closestServiceIndex(services: StrictVoiceService[], designation: string) {
  const key = serviceKey(designation);
  if (!key) return services.length - 1;
  let bestIndex = -1;
  let bestScore = 0;
  services.forEach((service, index) => {
    const score = nameScore(key, serviceKey(service.designation));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 0.72 ? bestIndex : -1;
}

export function fallbackStrictVoiceDocument(transcript: string, contextClients: string[] = []): StrictVoiceDocument {
  const segments = splitSpokenInstructions(transcript);
  const prestations: StrictVoiceService[] = [];
  let currentTax = cleanNumber([...transcript.matchAll(/tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)].at(-1)?.[1] ?? 0);

  for (const segment of segments) {
    currentTax = parseTax(segment, currentTax);
    const quantity = parseQuantity(segment);
    const price = parsePrice(segment);
    const designation = cleanDesignation(segment, quantity?.raw, price?.raw);
    const cancellation = CANCELLATION.test(segment);
    const correction = CORRECTION.test(segment);
    CANCELLATION.lastIndex = 0;
    CORRECTION.lastIndex = 0;

    if (cancellation) {
      const index = closestServiceIndex(prestations, designation);
      if (index >= 0) prestations.splice(index, 1);
      continue;
    }

    const containsUsefulData = Boolean(designation || quantity || price);
    if (!containsUsefulData) continue;

    if (correction && prestations.length) {
      const index = closestServiceIndex(prestations, designation);
      const targetIndex = index >= 0 ? index : prestations.length - 1;
      const previous = prestations[targetIndex];
      prestations[targetIndex] = {
        designation: designation || previous.designation,
        quantite: quantity?.value ?? previous.quantite,
        unite: quantity?.unit ?? previous.unite,
        prix_unitaire_ht: price?.value ?? previous.prix_unitaire_ht,
        taux_tva: currentTax || previous.taux_tva,
      };
      continue;
    }

    const service: StrictVoiceService = {
      designation: designation || "Prestation dictée",
      quantite: quantity?.value ?? 1,
      unite: quantity?.unit ?? "unite",
      prix_unitaire_ht: price?.value ?? 0,
      taux_tva: currentTax,
    };
    const existing = closestServiceIndex(prestations, service.designation);
    if (existing >= 0 && serviceKey(prestations[existing].designation) === serviceKey(service.designation)) {
      prestations.splice(existing, 1);
    }
    prestations.push(service);
  }

  return normalizeStrictVoiceDocument({
    client: { nom: extractLastClient(segments, contextClients) },
    prestations,
  }, contextClients);
}
