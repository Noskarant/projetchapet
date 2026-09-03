export const COMPANY_PROFILE_STORAGE_KEY = "projetchapet:company-profile:v1";

export type CompanyProfile = {
  version: 1;
  legalName: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
  accountingStart: string;
  accountingEnd: string;
  logoDataUrl: string;
  emailIntro: string;
  emailSignature: string;
  updatedAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function defaultCompanyProfile(): CompanyProfile {
  return {
    version: 1,
    legalName: "",
    siret: "",
    vatNumber: "",
    address: "",
    postalCode: "",
    city: "",
    accountingStart: "01-01",
    accountingEnd: "12-31",
    logoDataUrl: "",
    emailIntro: "Veuillez trouver ci-joint votre document. Merci de votre confiance.",
    emailSignature: "Cordialement,",
    updatedAt: new Date(0).toISOString(),
  };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function monthDay(value: unknown, fallback: string) {
  const candidate = text(value, 5);
  return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(candidate) ? candidate : fallback;
}

export function normalizeCompanyProfile(value: unknown): CompanyProfile {
  const fallback = defaultCompanyProfile();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const logo = text(raw.logoDataUrl, 800_000);
  return {
    version: 1,
    legalName: text(raw.legalName, 180),
    siret: text(raw.siret, 20).replace(/\D/g, "").slice(0, 14),
    vatNumber: text(raw.vatNumber, 30).replace(/\s/g, "").toUpperCase(),
    address: text(raw.address, 240),
    postalCode: text(raw.postalCode, 10),
    city: text(raw.city, 120),
    accountingStart: monthDay(raw.accountingStart, fallback.accountingStart),
    accountingEnd: monthDay(raw.accountingEnd, fallback.accountingEnd),
    logoDataUrl: /^data:image\/(png|jpe?g|webp);base64,/i.test(logo) ? logo : "",
    emailIntro: text(raw.emailIntro, 1200) || fallback.emailIntro,
    emailSignature: text(raw.emailSignature, 800) || fallback.emailSignature,
    updatedAt: text(raw.updatedAt, 40) || new Date().toISOString(),
  };
}

export function readCompanyProfile(storage: StorageLike): CompanyProfile {
  const raw = storage.getItem(COMPANY_PROFILE_STORAGE_KEY);
  if (!raw) return defaultCompanyProfile();
  try {
    return normalizeCompanyProfile(JSON.parse(raw));
  } catch {
    return defaultCompanyProfile();
  }
}

export function writeCompanyProfile(storage: StorageLike, profile: CompanyProfile): CompanyProfile {
  const normalized = normalizeCompanyProfile({ ...profile, updatedAt: new Date().toISOString() });
  storage.setItem(COMPANY_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function accountingExerciseLabel(profile: CompanyProfile, year = new Date().getFullYear()) {
  const start = profile.accountingStart.split("-");
  const end = profile.accountingEnd.split("-");
  if (profile.accountingStart === "01-01" && profile.accountingEnd === "12-31") return `Exercice ${year}`;
  return `Exercice ${start[1]}/${start[0]} → ${end[1]}/${end[0]}`;
}

export function buildDocumentEmailMessage(profile: CompanyProfile, documentLabel: string, number: string) {
  const identity = profile.legalName ? `\n${profile.legalName}` : "";
  return `Bonjour,\n\n${profile.emailIntro}\n\n${documentLabel} ${number}.\n\n${profile.emailSignature}${identity}`.trim();
}
