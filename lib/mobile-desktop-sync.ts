import type {
  Customer,
  CustomerInput,
  DocumentInput,
  DocumentItem,
  Invoice,
  InvoiceStatus,
  Quote,
  QuoteStatus,
} from "./project-chapet";
import {
  calculateTotals as calculateMobileTotals,
  customerDisplayName,
  type LineItem,
  type MobileCustomer,
  type MobileInvoice,
  type MobileQuote,
  type MobileWorkspace,
} from "./mobile-prototype";

export type NormalizedWorkspace = {
  customers: Customer[];
  quotes: Quote[];
  invoices: Invoice[];
};

export type EntityDiff<T extends { id: string }> = {
  created: T[];
  updated: T[];
  deleted: T[];
};

export type WorkspaceAliases = {
  customers: Map<string, string>;
  quotes: Map<string, string>;
  invoices: Map<string, string>;
};

export function emptyWorkspaceAliases(): WorkspaceAliases {
  return { customers: new Map(), quotes: new Map(), invoices: new Map() };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDatabaseId(value: string) {
  return uuidPattern.test(value);
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (!value || typeof value !== "object") return value;
  const ignored = new Set([
    "id", "number", "customerName", "subtotal", "taxTotal", "total",
    "created_at", "updated_at", "sent_at", "accepted_at", "signed_at",
  ]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !ignored.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForSignature(item)]),
  );
}

export function stableSignature(value: unknown) {
  return JSON.stringify(normalizeForSignature(value));
}

export function diffById<T extends { id: string }>(before: T[], after: T[]): EntityDiff<T> {
  const beforeMap = new Map(before.map((item) => [item.id, item]));
  const afterMap = new Map(after.map((item) => [item.id, item]));
  const created = after.filter((item) => !beforeMap.has(item.id));
  const deleted = before.filter((item) => !afterMap.has(item.id));
  const updated = after.filter((item) => {
    const previous = beforeMap.get(item.id);
    return previous ? stableSignature(previous) !== stableSignature(item) : false;
  });
  return { created, updated, deleted };
}

export function quoteStatusToMobile(status: QuoteStatus): MobileQuote["status"] {
  if (status === "accepted") return "Validé";
  if (status === "refused" || status === "expired" || status === "cancelled") return "Refusé";
  return "En attente";
}

export function invoiceStatusToMobile(status: InvoiceStatus): MobileInvoice["status"] {
  if (status === "paid") return "Payée";
  if (status === "overdue") return "En retard";
  if (status === "draft") return "Brouillon";
  if (status === "cancelled") return "Avoir";
  return "En cours";
}

export function mobileQuoteStatusToDesktop(status: MobileQuote["status"], previous?: QuoteStatus): QuoteStatus {
  if (previous && quoteStatusToMobile(previous) === status) return previous;
  if (status === "Validé" || status === "Terminé") return "accepted";
  if (status === "Refusé") return "refused";
  return "draft";
}

export function mobileInvoiceStatusToDesktop(status: MobileInvoice["status"], previous?: InvoiceStatus): InvoiceStatus {
  if (previous && invoiceStatusToMobile(previous) === status) return previous;
  if (status === "Payée") return "paid";
  if (status === "En retard") return "overdue";
  if (status === "Brouillon") return "draft";
  if (status === "Avoir") return "cancelled";
  return "issued";
}

function mobileLineFromDesktop(item: DocumentItem, previous?: LineItem): LineItem {
  const quantity = item.quantity ?? null;
  const unitPrice = item.unit_price ?? null;
  const taxRate = item.tax_rate ?? null;
  return {
    id: item.id ?? previous?.id ?? `line-${item.position}`,
    label: item.label,
    description: item.description ?? "",
    quantity,
    unit: item.unit ?? null,
    unitPrice,
    taxRate,
    incomplete: quantity === null || item.unit === null || unitPrice === null || taxRate === null,
    provenance: previous?.provenance ?? (quantity === null || item.unit === null || unitPrice === null ? "unknown" : "user_explicit"),
  };
}

function desktopItemFromMobile(item: LineItem, position: number): DocumentItem {
  const total = item.quantity === null || item.unitPrice === null ? 0 : Math.round(item.quantity * item.unitPrice * 100) / 100;
  // Les colonnes SQL deviennent nullable dans la migration de ce bloc. Le type desktop historique
  // reste temporairement numérique pour ne pas élargir toute l'UI d'un coup ; la frontière conserve
  // néanmoins les null réels afin que « À préciser » ne soit jamais transformé en zéro.
  return {
    position,
    label: item.label.trim() || "Prestation",
    description: item.description.trim() || null,
    quantity: item.quantity as number,
    unit: item.unit?.trim() || null,
    unit_price: item.unitPrice as number,
    tax_rate: item.taxRate as number,
    total,
  };
}

export function customerToMobile(customer: Customer): MobileCustomer {
  const address = customer.addresses?.[0] ?? {};
  return {
    id: customer.id,
    kind: customer.kind === "individual" ? "Particulier" : "Professionnel",
    companyName: customer.company_name ?? "",
    civility: customer.civility ?? "",
    lastName: customer.last_name ?? "",
    firstName: customer.first_name ?? "",
    emails: [...(customer.emails ?? [])],
    phones: [...(customer.phones ?? [])],
    address: address.line1 ?? "",
    postalCode: address.postal_code ?? "",
    city: address.city ?? "",
    siret: customer.siret ?? "",
    vat: customer.vat_number ?? "",
    notes: customer.notes ?? "",
  };
}

export function customerInputFromMobile(customer: MobileCustomer): CustomerInput {
  return {
    kind: customer.kind === "Particulier" ? "individual" : "business",
    company_name: customer.kind === "Professionnel" ? customer.companyName.trim() || null : null,
    civility: customer.kind === "Particulier" ? customer.civility.trim() || null : null,
    last_name: customer.kind === "Particulier" ? customer.lastName.trim() || null : null,
    first_name: customer.kind === "Particulier" ? customer.firstName.trim() || null : null,
    siret: customer.kind === "Professionnel" ? customer.siret.trim() || null : null,
    vat_number: customer.kind === "Professionnel" ? customer.vat.trim() || null : null,
    emails: customer.emails.map((item) => item.trim()).filter(Boolean),
    phones: customer.phones.map((item) => item.trim()).filter(Boolean),
    addresses: [{
      label: "Principale",
      line1: customer.address.trim(),
      postal_code: customer.postalCode.trim(),
      city: customer.city.trim(),
      country: "France",
    }],
    notes: customer.notes.trim() || null,
  };
}

export function quoteToMobile(quote: Quote, previous?: MobileQuote): MobileQuote {
  const items = quote.items.map((item, index) => mobileLineFromDesktop(item, previous?.items[index]));
  const totals = calculateMobileTotals(items);
  return {
    id: quote.id,
    number: quote.number,
    customerId: quote.customer_id,
    customerName: customerDisplayName(customerToMobile(quote.customer)),
    title: quote.title,
    issueDate: quote.issue_date,
    expiryDate: quote.expiry_date ?? "",
    status: quoteStatusToMobile(quote.status),
    items,
    notes: quote.notes ?? "",
    ...totals,
  };
}

export function quoteInputFromMobile(quote: MobileQuote, customerId: string, previousStatus?: QuoteStatus): DocumentInput {
  return {
    customer_id: customerId,
    title: quote.title.trim() || "Travaux",
    status: mobileQuoteStatusToDesktop(quote.status, previousStatus),
    issue_date: quote.issueDate || new Date().toISOString().slice(0, 10),
    expiry_date: quote.expiryDate || null,
    notes: quote.notes.trim() || null,
    items: quote.items.map(desktopItemFromMobile),
  };
}

export function invoiceToMobile(invoice: Invoice, previous?: MobileInvoice, quoteTitle?: string): MobileInvoice {
  const items = invoice.items.map((item, index) => mobileLineFromDesktop(item, previous?.items[index]));
  const totals = calculateMobileTotals(items);
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customer_id,
    customerName: customerDisplayName(customerToMobile(invoice.customer)),
    title: previous?.title || quoteTitle || "Travaux réalisés",
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date ?? "",
    status: invoiceStatusToMobile(invoice.status),
    items,
    notes: invoice.notes ?? "",
    ...totals,
    paidTotal: Number(invoice.paid_total || 0),
    accountantSent: previous?.accountantSent ?? false,
    ...(invoice.quote_id ? { sourceQuoteId: invoice.quote_id } : {}),
  };
}

export function invoiceInputFromMobile(
  invoice: MobileInvoice,
  customerId: string,
  quoteId: string | null,
  previousStatus?: InvoiceStatus,
): DocumentInput {
  return {
    customer_id: customerId,
    status: mobileInvoiceStatusToDesktop(invoice.status, previousStatus),
    issue_date: invoice.issueDate || new Date().toISOString().slice(0, 10),
    due_date: invoice.dueDate || null,
    notes: invoice.notes.trim() || null,
    items: invoice.items.map(desktopItemFromMobile),
    quote_id: quoteId,
  };
}

export function normalizedWorkspaceToMobile(
  workspace: NormalizedWorkspace,
  previous: MobileWorkspace,
): MobileWorkspace {
  const previousQuotes = new Map(previous.quotes.map((item) => [item.id, item]));
  const previousInvoices = new Map(previous.invoices.map((item) => [item.id, item]));
  const quoteTitles = new Map(workspace.quotes.map((quote) => [quote.id, quote.title]));
  const paidQuoteIds = new Set(
    workspace.invoices
      .filter((invoice) => invoice.status === "paid" && invoice.quote_id)
      .map((invoice) => invoice.quote_id as string),
  );
  return {
    customers: workspace.customers.map((customer) => customerToMobile(customer)),
    quotes: workspace.quotes.map((quote) => {
      const mobile = quoteToMobile(quote, previousQuotes.get(quote.id));
      if (quote.status === "accepted" && paidQuoteIds.has(quote.id)) return { ...mobile, status: "Terminé" as const };
      return mobile;
    }),
    invoices: workspace.invoices.map((invoice) => invoiceToMobile(invoice, previousInvoices.get(invoice.id), invoice.quote_id ? quoteTitles.get(invoice.quote_id) : undefined)),
    agenda: previous.agenda,
  };
}

function mergeById<T extends { id: string }>(server: T[], local: T[]) {
  const serverIds = new Set(server.map((item) => item.id));
  return [...server, ...local.filter((item) => !serverIds.has(item.id))];
}

export function mergeInitialMobileWorkspace(server: MobileWorkspace, local: MobileWorkspace): MobileWorkspace {
  return {
    customers: mergeById(server.customers, local.customers),
    quotes: mergeById(server.quotes, local.quotes),
    invoices: mergeById(server.invoices, local.invoices),
    agenda: local.agenda,
  };
}

export function applyWorkspaceAliases(workspace: MobileWorkspace, aliases: WorkspaceAliases): MobileWorkspace {
  return {
    customers: workspace.customers.map((customer) => ({
      ...customer,
      id: aliases.customers.get(customer.id) ?? customer.id,
    })),
    quotes: workspace.quotes.map((quote) => ({
      ...quote,
      id: aliases.quotes.get(quote.id) ?? quote.id,
      customerId: aliases.customers.get(quote.customerId) ?? quote.customerId,
    })),
    invoices: workspace.invoices.map((invoice) => ({
      ...invoice,
      id: aliases.invoices.get(invoice.id) ?? invoice.id,
      customerId: aliases.customers.get(invoice.customerId) ?? invoice.customerId,
      ...(invoice.sourceQuoteId
        ? { sourceQuoteId: aliases.quotes.get(invoice.sourceQuoteId) ?? invoice.sourceQuoteId }
        : {}),
    })),
    agenda: workspace.agenda.map((entry) => ({
      ...entry,
      customerId: aliases.customers.get(entry.customerId) ?? entry.customerId,
    })),
  };
}

export function coreWorkspaceSignature(workspace: MobileWorkspace) {
  return stableSignature({
    customers: workspace.customers,
    quotes: workspace.quotes,
    invoices: workspace.invoices,
  });
}
