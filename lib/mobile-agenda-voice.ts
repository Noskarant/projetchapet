export type AgendaVoiceType = "Chantier" | "Commande" | "Facturation" | "Relance";

export type ParsedAgendaVoice = {
  customer_hint: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: AgendaVoiceType;
  warnings: string[];
};

const DAY_INDEX: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const MONTH_INDEX: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

function upcomingDate(month: number, day: number, reference: Date, explicitYear?: number) {
  let year = explicitYear ?? reference.getFullYear();
  let value = validDate(year, month, day);
  if (!value) return null;
  if (explicitYear === undefined) {
    const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
    if (value < referenceDay) {
      year += 1;
      value = validDate(year, month, day);
    }
  }
  return value;
}

function addDays(reference: Date, amount: number) {
  const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
  date.setDate(date.getDate() + amount);
  return date;
}

function parseAgendaDate(text: string, reference: Date) {
  const normalized = normalize(text);

  const isoMatch = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return validDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const numericMatch = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numericMatch) {
    const rawYear = numericMatch[3] ? Number(numericMatch[3]) : undefined;
    const year = rawYear !== undefined && rawYear < 100 ? 2000 + rawYear : rawYear;
    return upcomingDate(Number(numericMatch[2]) - 1, Number(numericMatch[1]), reference, year);
  }

  const monthPattern = Object.keys(MONTH_INDEX).join("|");
  const monthMatch = normalized.match(new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${monthPattern})(?:\\s+(20\\d{2}))?\\b`));
  if (monthMatch) {
    return upcomingDate(
      MONTH_INDEX[monthMatch[2]],
      Number(monthMatch[1]),
      reference,
      monthMatch[3] ? Number(monthMatch[3]) : undefined,
    );
  }

  if (/\bapres[- ]demain\b/.test(normalized)) return addDays(reference, 2);
  if (/\bdemain\b/.test(normalized)) return addDays(reference, 1);
  if (/\baujourd'hui\b|\bce jour\b/.test(normalized)) return addDays(reference, 0);

  const inDays = normalized.match(/\bdans\s+(\d{1,3})\s+jours?\b/);
  if (inDays) return addDays(reference, Number(inDays[1]));

  const dayPattern = Object.keys(DAY_INDEX).join("|");
  const weekday = normalized.match(new RegExp(`\\b(${dayPattern})(?:\\s+prochain(?:e)?)?\\b`));
  if (weekday) {
    const target = DAY_INDEX[weekday[1]];
    let delta = (target - reference.getDay() + 7) % 7;
    const explicitlyNext = new RegExp(`${weekday[1]}\\s+prochain`).test(normalized);
    if (delta === 0 && explicitlyNext) delta = 7;
    return addDays(reference, delta);
  }

  return null;
}

function parseAgendaTime(text: string) {
  const normalized = normalize(text);
  if (/\bminuit\b/.test(normalized)) return "00:00";
  if (/\bmidi\b/.test(normalized)) return "12:00";

  const match = normalized.match(/(?:\ba\s+|\bvers\s+|\bpour\s+)?\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{1,2})?\b/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseAgendaType(text: string): AgendaVoiceType {
  const normalized = normalize(text);
  if (/\b(relance|relancer|rappeler|appel client)\b/.test(normalized)) return "Relance";
  if (/\b(commande|commander|materiel|fourniture|recuperer)\b/.test(normalized)) return "Commande";
  if (/\b(facturation|facturer|facture de situation|emettre une facture)\b/.test(normalized)) return "Facturation";
  return "Chantier";
}

function parseCustomerHint(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const withMatch = normalized.match(/\bavec\s+(?:le\s+client\s+|la\s+cliente\s+)?(.+?)(?=\s+(?:a\s+\d{1,2}(?:\s*h|:)|a\s+l['’]adresse|au\s+\d|aux\s+|chez\s+|sur\s+le\s+chantier|pour\s+|le\s+\d{1,2}[\/-]|[,.;]|$))/i);
  if (withMatch?.[1]) return withMatch[1].trim();

  const clientMatch = normalized.match(/\bclient(?:e)?\s+(.+?)(?=\s+(?:a\s+\d{1,2}(?:\s*h|:)|a\s+l['’]adresse|au\s+\d|chez\s+|pour\s+|[,.;]|$))/i);
  return clientMatch?.[1]?.trim() ?? "";
}

function parseLocation(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const explicit = normalized.match(/(?:a\s+l['’]adresse|adresse|lieu|sur\s+le\s+chantier|au\s+chantier)\s*[:,-]?\s*(.+?)(?=[.;]|$)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const afterClient = normalized.match(/\bavec\s+.+?\s+(?:a|au|aux|chez)\s+(.+?)(?=\s+(?:pour\s+|afin\s+de\s+)|[.;]|$)/i);
  const candidate = afterClient?.[1]?.trim() ?? "";
  if (!candidate || /^\d{1,2}\s*(?:h|heures?|:)/i.test(candidate)) return "";
  return candidate;
}

function defaultTitle(text: string, type: AgendaVoiceType) {
  const normalized = normalize(text);
  if (/\b(rendez[- ]?vous|rdv)\b/.test(normalized)) return "Rendez-vous";
  if (/\bvisite\b/.test(normalized)) return "Visite chantier";
  if (/\b(reunion|point chantier)\b/.test(normalized)) return "Réunion de chantier";
  if (/\bintervention\b/.test(normalized)) return "Intervention chantier";
  if (/\blivraison\b/.test(normalized)) return "Livraison";
  if (type === "Relance") return "Relance client";
  if (type === "Commande") return "Commande de fournitures";
  if (type === "Facturation") return "Facturation";
  return "Intervention chantier";
}

export function parseAgendaVoiceRequest(text: string, reference = new Date()): ParsedAgendaVoice {
  const date = parseAgendaDate(text, reference);
  const time = parseAgendaTime(text);
  const type = parseAgendaType(text);
  const customerHint = parseCustomerHint(text);
  const location = parseLocation(text);
  const warnings: string[] = [];

  if (!date) warnings.push("La date n’a pas été reconnue.");
  if (!time) warnings.push("L’heure n’a pas été reconnue.");
  if (!customerHint) warnings.push("Le client n’a pas été reconnu.");

  return {
    customer_hint: customerHint,
    title: defaultTitle(text, type),
    date: date ? isoDate(date) : "",
    time: time || "09:00",
    location,
    type,
    warnings,
  };
}

function cleanText(value: unknown, max = 400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeAgendaVoiceData(
  raw: Record<string, unknown>,
  transcript: string,
  reference = new Date(),
): ParsedAgendaVoice {
  const fallback = parseAgendaVoiceRequest(transcript, reference);
  const rawDate = cleanText(raw.date, 40);
  const rawTime = cleanText(raw.time, 20);
  const parsedDate = rawDate ? parseAgendaDate(rawDate, reference) : null;
  const parsedTime = rawTime ? parseAgendaTime(rawTime) : "";
  const allowedTypes: AgendaVoiceType[] = ["Chantier", "Commande", "Facturation", "Relance"];
  const rawType = cleanText(raw.type, 30) as AgendaVoiceType;
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];

  const result: ParsedAgendaVoice = {
    customer_hint: cleanText(raw.customer_hint, 180) || fallback.customer_hint,
    title: cleanText(raw.title, 240) || fallback.title,
    date: parsedDate ? isoDate(parsedDate) : fallback.date,
    time: parsedTime || fallback.time,
    location: cleanText(raw.location, 300) || fallback.location,
    type: allowedTypes.includes(rawType) ? rawType : fallback.type,
    warnings: [...new Set([...warnings, ...fallback.warnings])],
  };

  if (result.date) result.warnings = result.warnings.filter((value) => value !== "La date n’a pas été reconnue.");
  if (result.time) result.warnings = result.warnings.filter((value) => value !== "L’heure n’a pas été reconnue.");
  if (result.customer_hint) result.warnings = result.warnings.filter((value) => value !== "Le client n’a pas été reconnu.");
  return result;
}
