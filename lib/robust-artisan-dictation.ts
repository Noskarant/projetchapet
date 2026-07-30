import {
  fallbackStrictVoiceDocument,
  normalizeSpokenText,
  normalizeStrictVoiceDocument,
  resolveContextClient,
  type StrictVoiceDocument,
  type StrictVoiceService,
} from "@/lib/strict-voice-document";

function numeric(value: string | undefined, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const exact = lastExactClientMention(transcript, contextClients);
  if (exact) return exact;

  const mentions = [...transcript.matchAll(
    /\b(?:client(?:e)?|pour|avec)\s+((?:(?:m(?:onsieur)?|mr|mme|madame|mlle|mademoiselle)\.?\s+)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)(?=\s+(?:avec\s+un[e]?\s+lettre|avec\s+un[e]?\s+[a-z]\s+à\s+la\s+fin|pour\s+le|au\s+salon|dans\s+le|sur\s+le|qui|mais|ah|non|attends)|[,.;!]|$)/giu,
  )];
  const spoken = mentions.at(-1)?.[1]?.trim() ?? "";
  const resolved = resolveContextClient(contextClients, spoken);
  return resolved.status === "matched" ? resolved.name : spoken;
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
  const matches = [...value.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:m2|m²|mètres?\s+carrés?)/giu)];
  return numeric(matches.at(-1)?.[1]);
}

function lastPrice(value: string) {
  const matches = [...value.matchAll(/(?:à|a|passe\s+à|passe\s+a|mets?|mettre|pour|forfait(?:\s+peinture)?\s+à)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/giu)];
  return numeric(matches.at(-1)?.[1]);
}

function globalTax(transcript: string) {
  const explicit = transcript.match(/(?:applique|mets?|mettre)\s+(?:la\s+)?tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/iu)?.[1];
  if (explicit) return numeric(explicit);
  const matches = [...transcript.matchAll(/tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)];
  return numeric(matches[0]?.[1], 0);
}

function specialTax(transcript: string, keywords: RegExp, fallback: number) {
  const source = between(transcript, keywords);
  const matches = [...source.matchAll(/tva(?:\s+standard)?\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%?/giu)];
  return matches.length ? numeric(matches.at(-1)?.[1], fallback) : fallback;
}

function service(
  designation: string,
  quantite: number,
  unite: StrictVoiceService["unite"],
  prix: number,
  tva: number,
): StrictVoiceService | null {
  if (!designation || quantite <= 0 || prix < 0) return null;
  return {
    designation,
    quantite,
    unite,
    prix_unitaire_ht: prix,
    taux_tva: [0, 5.5, 10, 20].includes(tva) ? tva : 0,
  };
}

function extractWalls(transcript: string, tax: number) {
  const block = between(transcript, /\b(?:salon|peinture\s+murale|murs?)\b/iu, /\b(?:au\s+plafond|plafond)\b/iu);
  if (!block) return null;
  const area = lastArea(block);
  const price = lastPrice(block);
  if (!area || !price) return null;
  return service("Peinture murale du salon", area, "m2", price, tax);
}

function extractCeiling(transcript: string, tax: number) {
  const block = between(transcript, /\bplafond\b/iu, /\b(?:rajoute|ajoute|sous[- ]?couche|finition|portes?)\b/iu);
  if (!block) return null;
  const area = lastArea(block);
  const price = lastPrice(block);
  if (!area || !price) return null;
  const designation = /préparation\s+incluse/iu.test(block)
    ? "Peinture du plafond, préparation incluse"
    : "Peinture du plafond";
  return service(designation, area, "m2", price, tax);
}

function extractFinishing(transcript: string, tax: number) {
  const match = transcript.match(/(\d+(?:[,.]\d+)?)\s*(?:f[uû]ts?|pots?|seaux?)\s+de\s+([^.!?;,]{2,80}?)\s*(?:à|a)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(?:pi[eè]ce|l['’]unit[eé])?/iu);
  if (!match) return null;
  return service(`Fût de ${match[2].trim()}`, numeric(match[1]), "unite", numeric(match[3]), specialTax(transcript, /\bfinition\b/iu, tax));
}

function extractDoors(transcript: string, tax: number) {
  const block = between(transcript, /\bportes?\b/iu, /\b(?:main[- ]?d['’]œuvre|\bmo\b|heures?)\b/iu);
  if (!block) return null;
  const doorMatches = [...block.matchAll(/(\d+)\s+portes?/giu)];
  const doors = numeric(doorMatches.at(-1)?.[1]);
  const price = lastPrice(block);
  if (!doors || !price) return null;
  return service(`Forfait peinture de ${doors} portes`, 1, "forfait", price, tax);
}

function extractLabour(transcript: string, tax: number) {
  const match = transcript.match(/(\d+(?:[,.]\d+)?)\s*heures?\s+(?:de\s+)?(?:main[- ]?d['’]œuvre|mo)\s*(?:à|a)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/iu);
  if (!match) return null;
  return service("Main-d’œuvre", numeric(match[1]), "h", numeric(match[2]), tax);
}

function hasCancelledUndercoat(transcript: string) {
  return /(?:oublie|annule|supprime|retire|enl[eè]ve)[^.!?;,]{0,40}sous[- ]?couche/iu.test(transcript)
    || /sous[- ]?couche[^.!?;,]{0,50}(?:il\s+lui\s+en\s+reste|au\s+garage)/iu.test(transcript);
}

function extractUndercoat(transcript: string, tax: number) {
  if (hasCancelledUndercoat(transcript)) return null;
  const match = transcript.match(/(?:un|1)\s+pot\s+de\s+sous[- ]?couche\s*(?:à|a)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/iu);
  return match ? service("Pot de sous-couche", 1, "unite", numeric(match[1]), tax) : null;
}

export function robustArtisanDictation(transcript: string, contextClients: string[] = []): StrictVoiceDocument {
  const baseline = fallbackStrictVoiceDocument(transcript, contextClients);
  const complexSpeech = transcript.length >= 350
    || (transcript.match(/\b(?:non|attends?|pardon|finalement|plutôt|oublie|annule|supprime|retire|enlève)\b/giu)?.length ?? 0) >= 2;
  if (!complexSpeech) return baseline;

  const tax = globalTax(transcript);
  const extracted = [
    extractWalls(transcript, tax),
    extractCeiling(transcript, tax),
    extractUndercoat(transcript, tax),
    extractFinishing(transcript, tax),
    extractDoors(transcript, tax),
    extractLabour(transcript, tax),
  ].filter((entry): entry is StrictVoiceService => Boolean(entry));

  if (extracted.length < 2) return baseline;

  return normalizeStrictVoiceDocument({
    client: { nom: finalSpokenClient(transcript, contextClients) || baseline.client.nom },
    prestations: extracted,
  }, contextClients);
}
