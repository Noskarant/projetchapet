// Keep decimal facts in the transcript before asking the model to interpret them.
// These substitutions only join a clearly spoken fractional part; they do not
// infer an area unit from a length unit or invent a monetary/tax value.
export function normalizeVoiceTranscript(input: string) {
  return input
    .replace(/(\d{1,6})\s+(?:virgule|point)\s+(\d{1,3})(?=\D|$)/giu, "$1,$2")
    .replace(/(?<![\d,.])(\d{1,6})\s*(m(?:ètres?(?:\s+(?:carrés?|linéaires?))?|[²2l])|rouleaux?|euros?|€)\s+(\d{2})(?=\s|[.,;!?]|$)/giu, "$1,$3 $2")
    .replace(/\b((?:prénom|nom)\s+(?:(?:s['’]écrit|s['’]épelle|épelé)\s*)?:?\s*)((?:[a-z]\s*[,.-]?\s+){2,}[a-z])(?=\s|[.,;!?]|$)/giu,
      (_whole, prefix: string, letters: string) => `${prefix}${letters.replace(/[^a-z]/giu, "").toUpperCase()}`)
    .replace(/\b((?:s['’]épelle|s['’]écrit|lettre\s+par\s+lettre)\s*:?[ \t]*)((?:[a-z]\s*[,.-]?\s+){2,}[a-z])(?=\s|[.,;!?]|$)/giu,
      (_whole, prefix: string, letters: string) => `${prefix}${letters.replace(/[^a-z]/giu, "").toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function groundedEvidence(transcript: string, evidence: unknown) {
  const phrase = typeof evidence === "string" ? evidence.trim() : "";
  return phrase && comparable(transcript).includes(comparable(phrase)) ? phrase : "";
}

export function spelledName(transcript: string, field: "prénom" | "nom") {
  const normalized = normalizeVoiceTranscript(transcript);
  const label = field === "prénom" ? "[Pp]rénom" : "[Nn]om";
  const pattern = new RegExp(`(?<![\\p{L}])${label}\\s+([A-ZÀ-Ÿ]{2,30})(?=\\s|[.,;!?]|$)`, "u");
  const letters = normalized.match(pattern)?.[1];
  return letters ? letters[0] + letters.slice(1).toLocaleLowerCase("fr-FR") : null;
}

function decimal(value: string) {
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

const unitPattern = /(?:m(?:²|2)|mètres?\s+carrés?|mètres?\s+linéaires?|mètres?|ml|rouleaux?|unités?|pièces?|heures?|h|forfaits?)/iu;

export function explicitQuantity(phrase: string) {
  const text = normalizeVoiceTranscript(phrase);
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*(m(?:²|2)|mètres?\s+carrés?|mètres?\s+linéaires?|mètres?|ml|rouleaux?|unités?|pièces?|heures?|h|forfaits?)/iu);
  return match && unitPattern.test(match[2]) ? decimal(match[1]) : null;
}

export function explicitPrice(phrase: string) {
  const match = normalizeVoiceTranscript(phrase).match(/(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/iu);
  return match ? decimal(match[1]) : null;
}

export function explicitTax(phrase: string) {
  const match = phrase.match(/(?:tva|taxe\s+sur\s+la\s+valeur\s+ajoutée)\s*(?:à|de)?\s*(5[,.]5|10|20|0)\s*(?:%|pour\s+cent)?/iu);
  return match ? decimal(match[1]) : null;
}

export function spokenPriceType(phrase: string): "ht" | "ttc" | null {
  const value = comparable(phrase);
  if (/(?:\bttc\b|toutes? taxes? comprises?|taxes? comprises?)/u.test(value)) return "ttc";
  if (/(?:\bht\b|hors taxes?)/u.test(value)) return "ht";
  return null;
}

const roomPattern = /(?:chambre\s*(?:num[ée]ro\s*|n[°o]\s*)?\d+|couloir|salon|s[ée]jour|cuisine|salle\s+de\s+bain|entr[ée]e|bureau|garage|terrasse|fa[çc]ade|toiture)/giu;

function roomKey(value: string) {
  return comparable(value).replace(/(?:numero|n[°o])\s*/gu, "").replace(/\s+/g, " ");
}

// Associate a surface with the room that was actually spoken. A value from a
// neighboring room must never be copied into an unpriced room by the model.
export function roomEvidenceSegments(transcript: string, labels: string[]) {
  const spoken = [...transcript.matchAll(roomPattern)].map((match) => ({ key: roomKey(match[0]), start: match.index, end: match.index + match[0].length }));
  const keys = labels.map((label) => roomKey([...label.matchAll(roomPattern)][0]?.[0] ?? ""));
  if (new Set(keys.filter(Boolean)).size < 2) return labels.map(() => undefined);
  return keys.map((key) => {
    if (!key || keys.filter((entry) => entry === key).length !== 1 || spoken.filter((entry) => entry.key === key).length !== 1) return undefined;
    const position = spoken.findIndex((entry) => entry.key === key);
    const current = spoken[position];
    const next = spoken[position + 1];
    return transcript.slice(current.end, next?.start ?? transcript.length);
  });
}

export function roomQuantityEvidence(transcript: string, labels: string[]) {
  return roomEvidenceSegments(transcript, labels).map((segment) => {
    if (segment === undefined) return undefined;
    const quantities = [...segment.matchAll(/\d+(?:[,.]\d+)?\s*(?:m(?:²|2)|mètres?\s+carrés?|mètres?\s+linéaires?|mètres?|ml|rouleaux?|unités?|pièces?|heures?|h|forfaits?)/giu)];
    return quantities.length > 1 ? undefined : quantities.length === 1 ? explicitQuantity(quantities[0][0]) : null;
  });
}
