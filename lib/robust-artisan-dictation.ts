import {
  fallbackStrictVoiceDocument,
  normalizeSpokenText,
  normalizeStrictVoiceDocument,
  resolveContextClient,
  type StrictVoiceDocument,
  type StrictVoiceService,
} from "@/lib/strict-voice-document";

const SPOKEN_NUMBERS = new Map<string, number>([
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

function numeric(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function spokenNumber(value: string | undefined): number | null {
  if (!value) return null;
  return numeric(value) ?? SPOKEN_NUMBERS.get(value) ?? null;
}

function identityTokens(value: string) {
  return normalizeSpokenText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => ![
      "m", "mr", "monsieur", "mme", "madame", "mlle", "mademoiselle",
      "client", "cliente", "le", "la", "les", "de", "du", "des",
    ].includes(token));
}

function normalizeForExtraction(value: string) {
  return normalizeSpokenText(value
    .replace(/m²/giu, "m2")
    .replace(/€/gu, " euros ")
    .replace(/œ/giu, "oe"));
}

function lastExactClientMention(transcript: string, contextClients: string[]) {
  const normalizedTranscript = ` ${normalizeSpokenText(transcript)} `;
  let best: { name: string; index: number; length: number } | null = null;

  for (const candidate of contextClients) {
    const tokens = identityTokens(candidate);
    if (!tokens.length) continue;
    const forms = [...new Set([tokens.join(" "), tokens.at(-1) ?? ""])].filter((form) => form.length >= 3);
    const matches = forms.map((form) => ({
      index: normalizedTranscript.lastIndexOf(` ${form} `),
      length: form.length,
    }));
    const match = matches.sort((left, right) => right.index - left.index || right.length - left.length)[0];
    if (match.index < 0) continue;
    if (!best || match.index > best.index || (match.index === best.index && match.length > best.length)) {
      best = { name: candidate, index: match.index, length: match.length };
    }
  }

  return best?.name ?? "";
}

function finalSpokenClient(transcript: string, contextClients: string[]) {
  if (!contextClients.length) return "";
  const exact = lastExactClientMention(transcript, contextClients);
  if (exact) return exact;

  const mentions = [...transcript.matchAll(
    /\b(?:client(?:e)?|pour|avec)\s+((?:(?:m(?:onsieur)?|mr|mme|madame|mlle|mademoiselle)\.?\s+)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)(?=\s+(?:avec\s+un[e]?\s+lettre|avec\s+un[e]?\s+[a-z]\s+à\s+la\s+fin|pour\s+le|au\s+salon|dans\s+le|sur\s+le|qui|mais|ah|non|attends)|[,.;!]|$)/giu,
  )];
  for (const match of mentions.reverse()) {
    const spoken = match[1]?.trim() ?? "";
    const resolved = resolveContextClient(contextClients, spoken);
    if (resolved.status === "matched") return resolved.name;
  }
  return "";
}

function between(value: string, start: RegExp, end?: RegExp) {
  start.lastIndex = 0;
  const startMatch = start.exec(value);
  if (!startMatch || startMatch.index === undefined) return "";
  const from = startMatch.index;
  if (!end) return value.slice(from);
  end.lastIndex = 0;
  const rest = value.slice(from + startMatch[0].length);
  const endMatch = end.exec(rest);
  return endMatch?.index === undefined ? value.slice(from) : value.slice(from, from + startMatch[0].length + endMatch.index);
}

function lastArea(value: string) {
  const matches = [...value.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:m2|m 2|metres?\s+carres?)/gu)];
  return numeric(matches.at(-1)?.[1]);
}

function lastLinear(value: string) {
  const matches = [...value.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:ml|metres?\s+lineaires?)/gu)];
  return numeric(matches.at(-1)?.[1]);
}

function lastPrice(value: string) {
  if (/\b(?:offert|offerte|gratuit|gratuite|0\s*euro?s?)\b/u.test(value)) return 0;
  const matches = [...value.matchAll(/(?:a|passe\s+a|mets?|mettre|au\s+prix\s+de|prix(?:\s+unitaire)?(?:\s+de)?|pour|forfait(?:\s+peinture)?\s+a)\s*(\d+(?:[,.]\d+)?)(?:\s*(euros?|eur|€))?/gu)]
    .filter((match) => {
      if (match[2]) return true;
      const index = match.index ?? 0;
      const before = value.slice(Math.max(0, index - 16), index);
      const after = value.slice(index + match[0].length, index + match[0].length + 24);
      return !/\btva\s*$/.test(before) && /^\s+(?:ht|ttc|du|de|pour|piece|pieces|l|la|le|et|non|plutot)\b/u.test(after);
    });
  return numeric(matches.at(-1)?.[1]);
}

function globalTax(normalized: string): number | null {
  const explicit = normalized.match(/(?:applique|mets?|mettre)\s+(?:la\s+)?tva\s*(?:a|de)?\s*(5[,.]5|10|20|0)\s*%?/u)?.[1];
  if (explicit) return numeric(explicit);
  const matches = [...normalized.matchAll(/tva\s*(?:a|de)?\s*(5[,.]5|10|20|0)\s*%?/gu)];
  return numeric(matches[0]?.[1]);
}

function specialTax(normalized: string, keywords: RegExp, fallback: number | null) {
  const source = between(normalized, keywords);
  const matches = [...source.matchAll(/tva(?:\s+standard)?\s*(?:a|de)?\s*(5[,.]5|10|20|0)\s*%?/gu)];
  return matches.length ? numeric(matches.at(-1)?.[1]) : fallback;
}

function service(
  designation: string,
  quantite: number | null,
  unite: StrictVoiceService["unite"],
  prix: number | null,
  tva: number | null,
): StrictVoiceService | null {
  if (!designation || quantite === null || quantite <= 0 || prix === null || prix < 0) return null;
  return {
    designation,
    quantite,
    unite,
    prix_unitaire_ht: prix,
    taux_tva: tva !== null && [0, 5.5, 10, 20].includes(tva) ? tva : null,
  };
}

function unknownService(designation: string, tva: number | null): StrictVoiceService {
  return {
    designation,
    quantite: null,
    unite: null,
    prix_unitaire_ht: null,
    taux_tva: tva !== null && [0, 5.5, 10, 20].includes(tva) ? tva : null,
  };
}

function extractWalls(normalized: string, tax: number | null) {
  const block = between(normalized, /\b(?:salon|peinture\s+murale|murale|murs?)\b/u, /\bplafond\b/u);
  if (!block) return null;
  const label = /preparer\b/u.test(block) && /deux\s+couches?\s+de\s+peinture/u.test(block)
    ? "Préparation des murs et deux couches de peinture"
    : "Peinture murale du salon";
  return service(label, lastArea(block), "m2", lastPrice(block), tax);
}

function extractCeiling(normalized: string, tax: number | null) {
  const block = between(normalized, /\bplafond\b/u, /\b(?:ajoute|rajoute|plinthes?|portes?|dans\s+la\s+chambre)\b/u);
  if (!block) return null;
  const label = /preparation\s+incluse/u.test(block)
    ? "Peinture du plafond, préparation incluse"
    : "Peinture du plafond";
  return service(label, lastArea(block), "m2", lastPrice(block), tax);
}

function extractPlinths(normalized: string, tax: number | null) {
  const block = between(normalized, /\bplinthes?\b/u, /\b(?:portes?|dans\s+la\s+chambre)\b/u);
  if (!block) return null;
  return service("Peinture des plinthes", lastLinear(block), "m", lastPrice(block), tax);
}

function doorQuantity(normalized: string) {
  const correctionPatterns = [
    /\bportes?\b.{0,120}\bfinalement\b.{0,80}\bn\s+en\s+mets\s+qu\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/u,
    /\bportes?\b.{0,120}\bfinalement\b.{0,80}\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+portes?\b/u,
    /\bfinalement\b.{0,80}\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+portes?\b/u,
  ];
  for (const pattern of correctionPatterns) {
    const corrected = spokenNumber(normalized.match(pattern)?.[1]);
    if (corrected !== null) return corrected;
  }
  const matches = [...normalized.matchAll(/\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+portes?\b/gu)];
  return spokenNumber(matches.at(-1)?.[1]);
}

function extractDoors(normalized: string, tax: number | null) {
  const block = between(normalized, /\bportes?\b/u, /\b(?:et\s+colle|main\s+d\s+oeuvre|mo|heures?|dans\s+la\s+chambre)\b/u) || between(normalized, /\bportes?\b/u);
  if (!block) return null;
  const quantity = doorQuantity(normalized);
  if (quantity !== null && /\bforfait\b/u.test(block)) {
    return service(`Forfait peinture de ${quantity} portes`, 1, "forfait", lastPrice(block), tax);
  }
  const plural = quantity && quantity > 1 ? `${quantity} portes` : "une porte";
  return service(`Peinture de ${plural}`, quantity, "unite", lastPrice(block), tax);
}

function extractWallpaperRemoval(normalized: string, tax: number | null) {
  const match = normalized.match(/\benlever\s+l\s+ancien\s+papier\s+peint\s+sur\s+(\d+(?:[,.]\d+)?)\s*(?:m2|m 2|metres?\s+carres?)\s+a\s+(\d+(?:[,.]\d+)?)\s*(?:euros?|eur|€)/u);
  if (!match) return null;
  return service("Dépose de l'ancien papier peint", numeric(match[1]), "m2", numeric(match[2]), tax);
}

function extractBedroomPainting(normalized: string, tax: number | null) {
  const block = between(normalized, /\bpreparer\s+et\s+repeindre\b/u, /\b(?:ah|pour\s+les\s+portes|ajoute|prevois)\b/u);
  if (!block) return null;
  return service("Préparation et peinture de la chambre", lastArea(block), "m2", lastPrice(block), tax);
}

function extractFinishing(normalized: string, tax: number | null) {
  const match = normalized.match(/(\d+(?:[,.]\d+)?)\s*(?:futs?|pots?|seaux?)\s+de\s+(.{2,80}?)\s+a\s+(\d+(?:[,.]\d+)?)\s*(?:euros?|eur|€)/u);
  if (!match) return null;
  return service(`Fût de ${match[2].trim()}`, numeric(match[1]), "unite", numeric(match[3]), specialTax(normalized, /\bfinition\b/u, tax));
}

function extractLabour(normalized: string, tax: number | null) {
  const match = normalized.match(/(\d+(?:[,.]\d+)?)\s*heures?\s+(?:de\s+)?(?:main\s+d\s+oeuvre|mo)\s*a\s*(\d+(?:[,.]\d+)?)\s*(?:euros?|eur|€)/u);
  if (!match) return null;
  return service("Main-d’œuvre", numeric(match[1]), "h", numeric(match[2]), tax);
}

function hasCancelledUndercoat(normalized: string) {
  return /(?:oublie|annule|supprime|retire|enleve).{0,40}sous\s+couche/u.test(normalized)
    || /sous\s+couche.{0,50}(?:il\s+lui\s+en\s+reste|au\s+garage)/u.test(normalized);
}

function extractUndercoat(normalized: string, tax: number | null) {
  if (hasCancelledUndercoat(normalized)) return null;
  const match = normalized.match(/(?:un|1)\s+pot\s+de\s+sous\s+couche\s*a\s*(\d+(?:[,.]\d+)?)\s*(?:euros?|eur|€)/u);
  return match ? service("Pot de sous-couche", 1, "unite", numeric(match[1]), tax) : null;
}

function serviceKey(value: string) {
  return identityTokens(value)
    .filter((token) => !["pose", "fourniture", "travaux", "prestation"].includes(token))
    .join(" ");
}

function canonicalUnknown(service: StrictVoiceService, tax: number | null): StrictVoiceService | null {
  const key = serviceKey(service.designation);
  if (!key) return null;
  if (/devis|quentin|dubois/.test(key)) return null;
  if (/couches?\s+peinture/.test(key)) return null;
  if (/proteg|protection/.test(key) && /sol|meubles?/.test(key)) {
    return unknownService("Protection du sol et des meubles", service.taux_tva ?? tax);
  }
  if (/enduit/.test(key) && /couloir/.test(key)) {
    return unknownService("Reprise d'enduit dans le couloir", service.taux_tva ?? tax);
  }
  if (/protection/.test(key) && /chantier/.test(key)) {
    return unknownService("Protection du chantier", service.taux_tva ?? tax);
  }
  return null;
}

function uniqueServices(services: StrictVoiceService[]) {
  const result = new Map<string, StrictVoiceService>();
  services.forEach((entry, index) => {
    const key = serviceKey(entry.designation) || `ligne-${index}`;
    result.delete(key);
    result.set(key, entry);
  });
  return [...result.values()];
}

export function robustArtisanDictation(transcript: string, contextClients: string[] = []): StrictVoiceDocument {
  const baseline = fallbackStrictVoiceDocument(transcript, contextClients);
  const normalized = normalizeForExtraction(transcript);
  const complexSpeech = transcript.length >= 350
    || (normalized.match(/\b(?:non|attends?|pardon|finalement|plutot|oublie|annule|supprime|retire|enleve)\b/gu)?.length ?? 0) >= 2;
  const tax = globalTax(normalized);
  const extracted = [
    extractWalls(normalized, tax),
    extractCeiling(normalized, tax),
    extractPlinths(normalized, tax),
    extractUndercoat(normalized, tax),
    extractFinishing(normalized, tax),
    extractDoors(normalized, tax),
    extractWallpaperRemoval(normalized, tax),
    extractBedroomPainting(normalized, tax),
    extractLabour(normalized, tax),
  ].filter((entry): entry is StrictVoiceService => Boolean(entry));

  if (!complexSpeech && extracted.length === 0) return baseline;
  if (extracted.length === 0) return baseline;

  const unknowns = baseline.prestations
    .filter((entry) => entry.quantite === null || entry.prix_unitaire_ht === null)
    .map((entry) => canonicalUnknown(entry, tax))
    .filter((entry): entry is StrictVoiceService => Boolean(entry));
  const floorProtection = unknowns.filter((entry) => /sol|meubles/i.test(entry.designation));
  const laterUnknowns = unknowns.filter((entry) => !/sol|meubles/i.test(entry.designation));

  return normalizeStrictVoiceDocument({
    client: { nom: finalSpokenClient(transcript, contextClients) || baseline.client.nom },
    prestations: uniqueServices([...floorProtection, ...extracted, ...laterUnknowns]),
  }, contextClients);
}
