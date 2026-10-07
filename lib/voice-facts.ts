import { spokenAmountPattern, spokenFinancialNumber } from './spoken-financial-number';
const spokenAt = /\b(?:ar{1,2}obase|a\s+robase|arobas)\b/giu;
const emailAtom = "[a-z0-9_%+-]+";
const emailSeparator = "(?:\\s*\\.\\s*|\\s+(?:point|tiret(?:\\s+du\\s+bas)?|underscore)\\s+)";
const emailPart = `${emailAtom}(?:${emailSeparator}${emailAtom})*`;
const spokenAddress = new RegExp(`(${emailPart})\\s*@\\s*(${emailPart})`, "giu");

function emailSeparators(value: string) {
  return value.replace(/\s+point\s+/giu, ".")
    .replace(/\s+(?:tiret\s+du\s+bas|underscore)\s+/giu, "_")
    .replace(/\s+tiret\s+/giu, "-")
    .replace(/\s*([@.])\s*/g, "$1");
}

// Only compact spoken punctuation inside an address with an explicit @.
// A “point” elsewhere in a dictation must retain its original meaning.
function normalizeTranscriptEmails(input: string) {
  return input.replace(spokenAt, "@").replace(spokenAddress,
    (address) => {
      // A sentence-ending dot after the domain is not part of the address.
      const domainStart = address.indexOf("@") + 1;
      const boundary = address.slice(domainStart).search(/(?<=\b(?:fr|com|net|org|eu|be|ch|io|info|biz))\.\s+/iu);
      const end = boundary < 0 ? address.length : domainStart + boundary;
      return emailSeparators(address.slice(0, end)).toLocaleLowerCase("fr-FR") + address.slice(end);
    });
}

export function spokenEmailsFromTranscript(transcript: string) {
  return [...new Set([...normalizeTranscriptEmails(transcript)
    .matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}(?![a-z0-9_-])/giu)]
    .map((match) => match[0].toLocaleLowerCase("fr-FR")))];
}

export function isEmailSeparatorWarning(warning: string) {
  return /(?:@|ar{1,2}obase|arobas|symbole)/iu.test(warning)
    && /(?:e-?mail|adresse|manqu|absen|contien)/iu.test(warning);
}

// Keep decimal facts in the transcript before asking the model to interpret them.
// These substitutions only join a clearly spoken fractional part; they do not
// infer an area unit from a length unit or invent a monetary/tax value.
export function normalizeVoiceTranscript(input: string) {
  return normalizeTranscriptEmails(input)
    .replace(/(\d{1,6})\s+(?:virgule|point)\s+(\d{1,3})(?=\D|$)/giu, "$1,$2")
    .replace(/(?<![\d,.])(\d{1,6})\s*(m(?:ètres?(?:\s+(?:carrés?|linéaires?))?|[²2l])|rouleaux?|euros?|€)\s+(\d{2})(?!\s*(?:€|euros?|HT\b|TTC\b|hors[- ]taxes?))(?=\s|[.,;!?]|$)/giu, "$1,$3 $2")
    .replace(/\b((?:prénom|nom)\s+(?:(?:s['’]écrit|s['’]épelle|épelé)\s*)?:?\s*)((?:[a-z]\s*[,.-]?\s+){2,}[a-z])(?=\s|[.,;!?]|$)/giu,
      (_whole, prefix: string, letters: string) => `${prefix}${letters.replace(/[^a-z]/giu, "").toUpperCase()}`)
    .replace(/\b((?:s['’]épelle|s['’]écrit|lettre\s+par\s+lettre)\s*:?[ \t]*)((?:[a-z]\s*[,.-]?\s+){2,}[a-z])(?=\s|[.,;!?]|$)/giu,
      (_whole, prefix: string, letters: string) => `${prefix}${letters.replace(/[^a-z]/giu, "").toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

// Restore a separator only when it was spoken or the ending is a recognizable
// mail provider. An arbitrary dotted name can have several valid @ positions.
export function normalizeSpokenEmail(value: unknown, transcript = "") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  let email = emailSeparators(raw.toLocaleLowerCase("fr-FR").replace(spokenAt, "@"))
    .replace(/[\s.,;!]+$/g, "");
  if (!email.includes("@")) {
    const heard = spokenEmailsFromTranscript(transcript);
    const grounded = heard.filter((candidate) => candidate.replace("@", ".") === email
      || candidate.replace("@", "") === email || candidate.replace("@", " ") === email);
    if (grounded.length === 1) email = grounded[0];
    else email = email.replace(
      /^([a-z0-9][a-z0-9._%+-]*)\.(gmail|outlook|hotmail|yahoo|icloud|orange|free|laposte|example|exemple)\.(com|fr|net|org)$/u,
      "$1@$2.$3",
    );
  }
  return email;
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
  if (/\bune?\s+(?:unit[ée]|pièce|forfait)(?![\p{L}])/iu.test(text)) return 1;
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*(m(?:²|2)|mètres?\s+carrés?|mètres?\s+linéaires?|mètres?|ml|rouleaux?|unités?|pièces?|heures?|h|forfaits?)/iu);
  return match && unitPattern.test(match[2]) ? decimal(match[1]) : null;
}

export function explicitPrice(phrase: string) {
  const match = normalizeVoiceTranscript(phrase).match(new RegExp(`(${spokenAmountPattern})\\s*(?:€|euros?)`, 'iu'));
  return match ? spokenFinancialNumber(match[1]) : null;
}

export function explicitTax(phrase: string) {
  const match = phrase.match(new RegExp(`(?:tva|taxe\\s+sur\\s+la\\s+valeur\\s+ajoutée)\\s*(?:à|a|de|au\\s+taux\\s+de)?\\s*[:=]?\\s*(${spokenAmountPattern})\\s*(?:%|pour\\s+cent)?`, 'iu'));
  const rate = match ? spokenFinancialNumber(match[1]) : null;
  return rate !== null && [0,5.5,10,20].includes(rate) ? rate : null;
}

export function spokenPriceType(phrase: string): "ht" | "ttc" | null {
  const value = comparable(phrase);
  if (/(?:\bttc\b|toutes? taxes? comprises?|taxes? comprises?)/u.test(value)) return "ttc";
  if (/(?:\bht\b|hors[- ]taxes?)/u.test(value)) return "ht";
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
