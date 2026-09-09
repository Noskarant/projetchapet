export type EmailDocumentKind = "quote" | "invoice";

export type PilotEmailSnapshot = {
  workspace?: unknown;
  company_profile?: unknown;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeEmailAddress(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmailAddress(value: unknown) {
  const email = normalizeEmailAddress(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function uniqueValidEmails(values: unknown[]) {
  return [...new Set(values.filter(isValidEmailAddress).map(normalizeEmailAddress))];
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function snapshotRecipientsForDocument(
  snapshot: PilotEmailSnapshot,
  documentNumber: string,
  kind: EmailDocumentKind,
) {
  if (!isRecord(snapshot.workspace)) return { found: false, emails: [] as string[] };

  const documents = recordArray(snapshot.workspace[kind === "quote" ? "quotes" : "invoices"]);
  const document = documents.find((item) => String(item.number ?? "").trim() === documentNumber.trim());
  if (!document) return { found: false, emails: [] as string[] };

  const customerId = String(document.customerId ?? "").trim();
  const customers = recordArray(snapshot.workspace.customers);
  const customer = customers.find((item) => String(item.id ?? "").trim() === customerId);
  const customerEmails = customer && Array.isArray(customer.emails) ? customer.emails : [];

  const profile = isRecord(snapshot.company_profile) ? snapshot.company_profile : {};
  return {
    found: true,
    emails: uniqueValidEmails([...customerEmails, profile.accountingEmail]),
  };
}

export function recipientsAreAuthorized(requested: string[], allowed: string[]) {
  const allowedSet = new Set(uniqueValidEmails(allowed));
  const requestedEmails = requested.map(normalizeEmailAddress).filter(Boolean);
  return requestedEmails.length > 0
    && requestedEmails.every((email) => isValidEmailAddress(email) && allowedSet.has(email));
}
