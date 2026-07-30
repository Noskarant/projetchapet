import {
  calculateTotals,
  seedMobileWorkspace,
  type LineItem,
  type MobileAgendaEntry,
  type MobileCustomer,
  type MobileInvoice,
  type MobileQuote,
  type MobileWorkspace,
} from "./mobile-prototype";

export const MOBILE_WORKSPACE_STORAGE_KEY = "projetchapet-mobile-workspace-v3";
const CORRUPT_BACKUP_PREFIX = "projetchapet-mobile-workspace-corrupt";

export type WorkspacePreparationStatus = "unchanged" | "seeded" | "normalized" | "recovered";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function normalizeLine(value: unknown, index: number): LineItem | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, `line-recovered-${index}`),
    label: stringValue(value.label),
    description: stringValue(value.description),
    quantity: numberValue(value.quantity, 1),
    unit: stringValue(value.unit, "u"),
    unitPrice: numberValue(value.unitPrice),
    taxRate: numberValue(value.taxRate, 20),
  };
}

function normalizeCustomer(value: unknown, index: number): MobileCustomer | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === "Particulier" ? "Particulier" : "Professionnel";
  return {
    id: stringValue(value.id, `customer-recovered-${index}`),
    kind,
    companyName: stringValue(value.companyName),
    civility: stringValue(value.civility, "M."),
    lastName: stringValue(value.lastName),
    firstName: stringValue(value.firstName),
    emails: stringArray(value.emails, ["", ""]),
    phones: stringArray(value.phones, ["", ""]),
    address: stringValue(value.address),
    postalCode: stringValue(value.postalCode),
    city: stringValue(value.city),
    siret: stringValue(value.siret),
    vat: stringValue(value.vat),
    notes: stringValue(value.notes),
  };
}

function normalizeQuote(value: unknown, index: number): MobileQuote | null {
  if (!isRecord(value)) return null;
  const items = (Array.isArray(value.items) ? value.items : [])
    .map(normalizeLine)
    .filter((item): item is LineItem => item !== null);
  const status = ["En attente", "Validé", "Terminé", "Refusé"].includes(stringValue(value.status))
    ? (value.status as MobileQuote["status"])
    : "En attente";
  return {
    id: stringValue(value.id, `quote-recovered-${index}`),
    number: stringValue(value.number),
    customerId: stringValue(value.customerId),
    customerName: stringValue(value.customerName, "Client à sélectionner"),
    title: stringValue(value.title, "Travaux"),
    issueDate: stringValue(value.issueDate),
    expiryDate: stringValue(value.expiryDate),
    status,
    items,
    notes: stringValue(value.notes),
    ...calculateTotals(items),
  };
}

function normalizeInvoice(value: unknown, index: number): MobileInvoice | null {
  if (!isRecord(value)) return null;
  const items = (Array.isArray(value.items) ? value.items : [])
    .map(normalizeLine)
    .filter((item): item is LineItem => item !== null);
  const allowedStatuses = ["Brouillon", "En cours", "Payée", "En retard", "Avoir"];
  const status = allowedStatuses.includes(stringValue(value.status))
    ? (value.status as MobileInvoice["status"])
    : "Brouillon";
  return {
    id: stringValue(value.id, `invoice-recovered-${index}`),
    number: stringValue(value.number),
    customerId: stringValue(value.customerId),
    customerName: stringValue(value.customerName, "Client à sélectionner"),
    title: stringValue(value.title, "Travaux réalisés"),
    issueDate: stringValue(value.issueDate),
    dueDate: stringValue(value.dueDate),
    status,
    items,
    notes: stringValue(value.notes),
    ...calculateTotals(items),
    paidTotal: Math.max(0, numberValue(value.paidTotal)),
    accountantSent: booleanValue(value.accountantSent),
    ...(typeof value.sourceQuoteId === "string" ? { sourceQuoteId: value.sourceQuoteId } : {}),
  };
}

function normalizeAgenda(value: unknown, index: number): MobileAgendaEntry | null {
  if (!isRecord(value)) return null;
  const allowedTypes = ["Chantier", "Facturation", "Commande", "Relance"];
  const type = allowedTypes.includes(stringValue(value.type))
    ? (value.type as MobileAgendaEntry["type"])
    : "Chantier";
  return {
    id: stringValue(value.id, `agenda-recovered-${index}`),
    date: stringValue(value.date),
    time: stringValue(value.time, "09:00"),
    type,
    title: stringValue(value.title),
    customerId: stringValue(value.customerId),
    customerName: stringValue(value.customerName, "Client à sélectionner"),
    done: booleanValue(value.done),
  };
}

export function isMobileWorkspace(value: unknown): value is MobileWorkspace {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.customers) || !Array.isArray(value.quotes) || !Array.isArray(value.invoices) || !Array.isArray(value.agenda)) return false;

  return value.customers.every((customer) => isRecord(customer) && typeof customer.id === "string" && Array.isArray(customer.emails) && Array.isArray(customer.phones))
    && value.quotes.every((quote) => isRecord(quote) && typeof quote.id === "string" && Array.isArray(quote.items))
    && value.invoices.every((invoice) => isRecord(invoice) && typeof invoice.id === "string" && Array.isArray(invoice.items) && typeof invoice.accountantSent === "boolean")
    && value.agenda.every((entry) => isRecord(entry) && typeof entry.id === "string");
}

export function normalizeMobileWorkspace(value: unknown, fallback: MobileWorkspace = seedMobileWorkspace()): MobileWorkspace {
  if (!isRecord(value)) return fallback;

  const customers = (Array.isArray(value.customers) ? value.customers : fallback.customers)
    .map(normalizeCustomer)
    .filter((item): item is MobileCustomer => item !== null);
  const quotes = (Array.isArray(value.quotes) ? value.quotes : fallback.quotes)
    .map(normalizeQuote)
    .filter((item): item is MobileQuote => item !== null);
  const invoices = (Array.isArray(value.invoices) ? value.invoices : fallback.invoices)
    .map(normalizeInvoice)
    .filter((item): item is MobileInvoice => item !== null);
  const agenda = (Array.isArray(value.agenda) ? value.agenda : fallback.agenda)
    .map(normalizeAgenda)
    .filter((item): item is MobileAgendaEntry => item !== null);

  return {
    customers: customers.length ? customers : fallback.customers,
    quotes,
    invoices,
    agenda,
  };
}

export function prepareMobileWorkspaceStorage(
  storage: StorageLike,
  fallback: MobileWorkspace = seedMobileWorkspace(),
): WorkspacePreparationStatus {
  const raw = storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
  if (!raw) {
    storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(fallback));
    return "seeded";
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isMobileWorkspace(parsed)) return "unchanged";
    storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(normalizeMobileWorkspace(parsed, fallback)));
    return "normalized";
  } catch {
    storage.setItem(`${CORRUPT_BACKUP_PREFIX}-${Date.now()}`, raw);
    storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(fallback));
    return "recovered";
  }
}
