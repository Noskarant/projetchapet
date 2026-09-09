export type CustomerKind = "Professionnel" | "Particulier";
export type QuoteStatus = "En attente" | "Validé" | "Terminé" | "Refusé";
export type InvoiceStatus = "Brouillon" | "En cours" | "Payée" | "En retard" | "Avoir";
export type AgendaType = "Chantier" | "Facturation" | "Commande" | "Relance";
export type AgendaFilter = "today" | "week" | "invoice";

export type LineItem = {
  id: string;
  label: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  taxRate: number | null;
  incomplete?: boolean;
  provenance?: "user_explicit" | "company_pricebook" | "company_history" | "metier_database" | "unknown";
};

export type MobileCustomer = {
  id: string;
  kind: CustomerKind;
  companyName: string;
  civility: string;
  lastName: string;
  firstName: string;
  emails: string[];
  phones: string[];
  address: string;
  postalCode: string;
  city: string;
  siret: string;
  vat: string;
  notes: string;
};

export type MobileQuote = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  title: string;
  issueDate: string;
  expiryDate: string;
  status: QuoteStatus;
  items: LineItem[];
  notes: string;
  subtotal: number;
  taxTotal: number;
  total: number;
};

export type MobileInvoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  title: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: LineItem[];
  notes: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  accountantSent: boolean;
  sourceQuoteId?: string;
};

export type MobileAgendaEntry = {
  id: string;
  date: string;
  time: string;
  type: AgendaType;
  title: string;
  customerId: string;
  customerName: string;
  done: boolean;
};

export type MobileWorkspace = {
  customers: MobileCustomer[];
  quotes: MobileQuote[];
  invoices: MobileInvoice[];
  agenda: MobileAgendaEntry[];
};

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function calculateLineTotal(item: LineItem) {
  if (item.incomplete || item.quantity === null || item.unitPrice === null) return 0;
  return round(item.quantity * item.unitPrice);
}

export function calculateTotals(items: LineItem[]) {
  const subtotal = round(items.reduce((sum, item) => sum + calculateLineTotal(item), 0));
  const taxTotal = round(items.reduce((sum, item) => sum + calculateLineTotal(item) * Number(item.taxRate ?? 0) / 100, 0));
  return { subtotal, taxTotal, total: round(subtotal + taxTotal) };
}

export function customerDisplayName(customer: MobileCustomer) {
  if (customer.kind === "Professionnel") return customer.companyName.trim() || "Entreprise sans nom";
  return [customer.civility, customer.lastName, customer.firstName].filter(Boolean).join(" ").trim() || "Client sans nom";
}

export function nextNumber(existing: Array<{ number: string }>, prefix: "D" | "F" | "A") {
  const year = new Date().getFullYear();
  const max = existing.reduce((current, item) => {
    if (!item.number.startsWith(`${prefix}-${year}-`)) return current;
    const value = Number(item.number.split("-").at(-1) || 0);
    return Math.max(current, Number.isFinite(value) ? value : 0);
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function normalizeQuote(quote: MobileQuote): MobileQuote {
  return { ...quote, ...calculateTotals(quote.items), items: quote.items.map((item, index) => ({ ...item, id: item.id || makeId(`line-${index}`) })) };
}

export function normalizeInvoice(invoice: MobileInvoice): MobileInvoice {
  return { ...invoice, ...calculateTotals(invoice.items), items: invoice.items.map((item, index) => ({ ...item, id: item.id || makeId(`line-${index}`) })) };
}

export function upsertCustomer(workspace: MobileWorkspace, customer: MobileCustomer): MobileWorkspace {
  const exists = workspace.customers.some((item) => item.id === customer.id);
  return { ...workspace, customers: exists ? workspace.customers.map((item) => item.id === customer.id ? customer : item) : [customer, ...workspace.customers] };
}

export function upsertQuote(workspace: MobileWorkspace, quote: MobileQuote): MobileWorkspace {
  const normalized = normalizeQuote(quote);
  const exists = workspace.quotes.some((item) => item.id === quote.id);
  return { ...workspace, quotes: exists ? workspace.quotes.map((item) => item.id === quote.id ? normalized : item) : [normalized, ...workspace.quotes] };
}

export function upsertInvoice(workspace: MobileWorkspace, invoice: MobileInvoice): MobileWorkspace {
  const normalized = normalizeInvoice(invoice);
  const exists = workspace.invoices.some((item) => item.id === invoice.id);
  const invoices = exists
    ? workspace.invoices.map((item) => item.id === invoice.id ? normalized : item)
    : [normalized, ...workspace.invoices];

  const quotes = normalized.status === "Payée" && normalized.sourceQuoteId
    ? workspace.quotes.map((quote) => quote.id === normalized.sourceQuoteId
      ? normalizeQuote({ ...quote, status: "Terminé" })
      : quote)
    : workspace.quotes;

  return { ...workspace, invoices, quotes };
}

export function upsertAgenda(workspace: MobileWorkspace, entry: MobileAgendaEntry): MobileWorkspace {
  const exists = workspace.agenda.some((item) => item.id === entry.id);
  return { ...workspace, agenda: exists ? workspace.agenda.map((item) => item.id === entry.id ? entry : item) : [entry, ...workspace.agenda] };
}

export function convertQuoteToInvoice(workspace: MobileWorkspace, quote: MobileQuote): { workspace: MobileWorkspace; invoice: MobileInvoice } {
  const existing = workspace.invoices.find((item) => item.sourceQuoteId === quote.id);
  if (existing) return { workspace, invoice: existing };
  const issueDate = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const invoice = normalizeInvoice({
    id: makeId("invoice"), number: nextNumber(workspace.invoices, "F"), customerId: quote.customerId,
    customerName: quote.customerName, title: quote.title, issueDate, dueDate: due.toISOString().slice(0, 10),
    status: "Brouillon", items: quote.items.map((item) => ({ ...item, id: makeId("line") })), notes: quote.notes,
    subtotal: 0, taxTotal: 0, total: 0, paidTotal: 0, accountantSent: false, sourceQuoteId: quote.id,
  });

  return { workspace: upsertInvoice(workspace, invoice), invoice };
}

export function createCreditNote(workspace: MobileWorkspace, invoice: MobileInvoice): { workspace: MobileWorkspace; credit: MobileInvoice } {
  const credit = normalizeInvoice({
    ...invoice,
    id: makeId("credit"),
    number: nextNumber(workspace.invoices, "A"),
    status: "Avoir",
    items: invoice.items.map((item) => ({ ...item, id: makeId("line"), quantity: item.quantity === null ? null : -Math.abs(item.quantity) })),
    paidTotal: 0,
    accountantSent: false,
    sourceQuoteId: undefined,
  });
  return { workspace: upsertInvoice(workspace, credit), credit };
}

export function deleteQuoteFromWorkspace(workspace: MobileWorkspace, id: string) {
  return { ...workspace, quotes: workspace.quotes.filter((item) => item.id !== id) };
}

export function deleteInvoiceFromWorkspace(workspace: MobileWorkspace, id: string) {
  return { ...workspace, invoices: workspace.invoices.filter((item) => item.id !== id) };
}

export function deleteCustomerFromWorkspace(workspace: MobileWorkspace, id: string) {
  return { ...workspace, customers: workspace.customers.filter((item) => item.id !== id) };
}

export function filterAgenda(entries: MobileAgendaEntry[], filter: AgendaFilter, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);
  if (filter === "today") return entries.filter((entry) => entry.date === today);
  if (filter === "invoice") return entries.filter((entry) => entry.type === "Facturation" && !entry.done);
  return entries.filter((entry) => entry.date >= today && entry.date <= weekEndIso);
}

export function seedMobileWorkspace(): MobileWorkspace {
  return { customers: [], quotes: [], invoices: [], agenda: [] };
}
