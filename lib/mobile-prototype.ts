export type CustomerKind = "Professionnel" | "Particulier";
export type QuoteStatus = "En attente" | "Validé" | "Terminé" | "Refusé";
export type InvoiceStatus = "Brouillon" | "En cours" | "Payée" | "En retard" | "Avoir";
export type AgendaType = "Chantier" | "Facturation" | "Commande" | "Relance";
export type AgendaFilter = "today" | "week" | "invoice";

export type LineItem = {
  id: string;
  label: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
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
  return round(Number(item.quantity || 0) * Number(item.unitPrice || 0));
}

export function calculateTotals(items: LineItem[]) {
  const subtotal = round(items.reduce((sum, item) => sum + calculateLineTotal(item), 0));
  const taxTotal = round(items.reduce((sum, item) => sum + calculateLineTotal(item) * Number(item.taxRate || 0) / 100, 0));
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

  // Un devis accepté reste dans l’onglet « Validé » tant que sa facture n’est pas payée.
  // Au paiement, il passe en « Terminé » : il disparaît du filtre des devis acceptés,
  // tout en restant conservé dans la liste générale et dans l’historique local.
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

  // La conversion ne clôt plus prématurément le devis accepté.
  // Sa clôture intervient automatiquement lorsque la facture liée est payée.
  return { workspace: upsertInvoice(workspace, invoice), invoice };
}

export function createCreditNote(workspace: MobileWorkspace, invoice: MobileInvoice): { workspace: MobileWorkspace; credit: MobileInvoice } {
  const credit = normalizeInvoice({
    ...invoice,
    id: makeId("credit"),
    number: nextNumber(workspace.invoices, "A"),
    status: "Avoir",
    items: invoice.items.map((item) => ({ ...item, id: makeId("line"), quantity: -Math.abs(item.quantity) })),
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
  const customers: MobileCustomer[] = [
    { id: "C-001", kind: "Professionnel", companyName: "CHAPET Père & Fils", civility: "", lastName: "", firstName: "", emails: ["contact@saschapet.com", "compta@saschapet.com"], phones: ["06 81 20 14 88", "04 77 21 09 14"], address: "18 rue Jean-Neyret", postalCode: "42000", city: "Saint-Étienne", siret: "879 214 563 00012", vat: "FR 12 879214563", notes: "" },
    { id: "C-002", kind: "Professionnel", companyName: "SCI BELLEVUE", civility: "", lastName: "", firstName: "", emails: ["gestion@scibellevue.fr"], phones: ["06 71 52 10 33"], address: "4 place du Monteil", postalCode: "43120", city: "Monistrol-sur-Loire", siret: "843 621 540 00018", vat: "FR 89 843621540", notes: "" },
    { id: "C-003", kind: "Particulier", companyName: "", civility: "Mme", lastName: "DECHAUD", firstName: "Isabelle", emails: ["isabelle.dechaud@mail.fr"], phones: ["06 22 84 13 57"], address: "8 rue des Lilas", postalCode: "42230", city: "Roche-la-Molière", siret: "", vat: "", notes: "" },
    { id: "C-004", kind: "Particulier", companyName: "", civility: "Mme", lastName: "SOULIER", firstName: "Françoise", emails: ["f.soulier@mail.fr"], phones: ["06 19 54 74 12"], address: "14 avenue de la Gare", postalCode: "42700", city: "Firminy", siret: "", vat: "", notes: "" },
  ];
  const line = (label: string, quantity: number, unitPrice: number, taxRate = 10): LineItem => ({ id: makeId("seed-line"), label, description: "", quantity, unit: "m²", unitPrice, taxRate });
  const quoteBase = (id: string, number: string, customerId: string, title: string, status: QuoteStatus, items: LineItem[], issueDate: string, expiryDate: string): MobileQuote => normalizeQuote({ id, number, customerId, customerName: customerDisplayName(customers.find((item) => item.id === customerId)!), title, issueDate, expiryDate, status, items, notes: "", subtotal: 0, taxTotal: 0, total: 0 });
  const quotes = [
    quoteBase("Q-378", "D-2026-378", "C-003", "Peinture séjour et couloir", "En attente", [line("Protection et préparation", 1, 210, 10), line("Peinture séjour et couloir", 18, 39.7, 10)], "2026-07-30", "2026-08-28"),
    quoteBase("Q-377", "D-2026-377", "C-004", "Reprise plafond cuisine", "Validé", [line("Reprise plafond cuisine", 1, 310, 10)], "2026-07-29", "2026-08-28"),
    quoteBase("Q-376", "D-2026-376", "C-002", "Hall d’entrée", "En attente", [line("Préparation et peinture hall", 1, 2036.36, 10)], "2026-07-18", "2026-08-18"),
  ];
  const invoiceFrom = (id: string, number: string, customerId: string, title: string, status: InvoiceStatus, items: LineItem[], issueDate: string, dueDate: string, paidTotal = 0, accountantSent = false, sourceQuoteId?: string): MobileInvoice => normalizeInvoice({ id, number, customerId, customerName: customerDisplayName(customers.find((item) => item.id === customerId)!), title, issueDate, dueDate, status, items, notes: "", subtotal: 0, taxTotal: 0, total: 0, paidTotal, accountantSent, sourceQuoteId });
  const invoices = [
    invoiceFrom("I-017", "F-2026-017", "C-001", "Situation chantier", "Payée", [line("Facture de situation", 1, 2650.91, 10)], "2026-07-10", "2026-08-10", 2916, true),
    invoiceFrom("I-018", "F-2026-018", "C-002", "Hall d’entrée", "En cours", [line("Acompte travaux", 1, 1221.82, 10)], "2026-07-12", "2026-08-12", 0, true),
    invoiceFrom("I-019", "F-2026-019", "C-004", "Reprise plafond", "Brouillon", [line("Reprise plafond", 1, 310, 10)], "2026-07-09", "2026-08-09", 0, false, "Q-377"),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const agenda: MobileAgendaEntry[] = [
    { id: "A-01", date: today, time: "08:30", type: "Commande", title: "Commander peinture façade", customerId: "C-002", customerName: "SCI BELLEVUE", done: false },
    { id: "A-02", date: today, time: "10:00", type: "Chantier", title: "Visite avant démarrage", customerId: "C-003", customerName: "Isabelle DECHAUD", done: false },
    { id: "A-03", date: today, time: "14:00", type: "Facturation", title: "Émettre facture de situation", customerId: "C-001", customerName: "CHAPET Père & Fils", done: false },
    { id: "A-04", date: tomorrow, time: "09:00", type: "Relance", title: "Relancer devis D-2026-376", customerId: "C-002", customerName: "SCI BELLEVUE", done: false },
  ];
  return { customers, quotes, invoices, agenda };
}
