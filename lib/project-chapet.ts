import { supabase } from "./supabase";

export const DEMO_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

export type CustomerKind = "individual" | "business";
export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "expired" | "cancelled";
export type InvoiceStatus = "draft" | "issued" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";

export type Address = { label?: string; line1?: string; line2?: string; postal_code?: string; city?: string; country?: string };

export type Customer = {
  id: string; organization_id: string; kind: CustomerKind; company_name: string | null; civility: string | null;
  last_name: string | null; first_name: string | null; siret: string | null; vat_number: string | null;
  emails: string[]; phones: string[]; addresses: Address[]; notes: string | null; created_at: string; updated_at: string;
};

export type DocumentItem = {
  id?: string; position: number; label: string; description: string | null; quantity: number;
  unit: string | null; unit_price: number; tax_rate: number; total: number;
};

export type Quote = {
  id: string; organization_id: string; customer_id: string; number: string; title: string; status: QuoteStatus;
  issue_date: string; expiry_date: string | null; subtotal: number; tax_total: number; total: number;
  notes: string | null; sent_at: string | null; accepted_at: string | null; created_at: string; updated_at: string;
  customer: Customer; items: DocumentItem[];
};

export type Invoice = {
  id: string; organization_id: string; customer_id: string; quote_id: string | null; number: string; status: InvoiceStatus;
  issue_date: string; due_date: string | null; subtotal: number; tax_total: number; total: number; paid_total: number;
  notes: string | null; sent_at: string | null; created_at: string; updated_at: string; customer: Customer; items: DocumentItem[];
};

export type CustomerInput = {
  kind: CustomerKind; company_name: string | null; civility: string | null; last_name: string | null;
  first_name: string | null; siret: string | null; vat_number: string | null; emails: string[];
  phones: string[]; addresses: Address[]; notes: string | null;
};

export type DocumentInput = {
  customer_id: string; title?: string; status: QuoteStatus | InvoiceStatus; issue_date: string;
  expiry_date?: string | null; due_date?: string | null; notes: string | null; items: DocumentItem[]; quote_id?: string | null;
};

export function customerName(customer: Pick<Customer, "kind" | "company_name" | "civility" | "last_name" | "first_name">) {
  if (customer.kind === "business") return customer.company_name || "Entreprise sans nom";
  return [customer.civility, customer.last_name, customer.first_name].filter(Boolean).join(" ") || "Client sans nom";
}

export function calculateTotals(items: DocumentItem[]) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const tax_total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0) * (Number(item.tax_rate || 0) / 100), 0);
  return { subtotal: Math.round(subtotal * 100) / 100, tax_total: Math.round(tax_total * 100) / 100, total: Math.round((subtotal + tax_total) * 100) / 100 };
}

function normalizeItems(items: DocumentItem[]) {
  return items.map((item, index) => ({
    position: index, label: item.label.trim(), description: item.description?.trim() || null,
    quantity: Number(item.quantity || 0), unit: item.unit?.trim() || null, unit_price: Number(item.unit_price || 0),
    tax_rate: Number(item.tax_rate || 0), total: Math.round(Number(item.quantity || 0) * Number(item.unit_price || 0) * 100) / 100,
  }));
}

export async function fetchWorkspace() {
  const [customersResult, quotesResult, invoicesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("organization_id", DEMO_ORGANIZATION_ID).order("created_at", { ascending: false }),
    supabase.from("quotes").select("*, customer:customers(*), items:quote_items(*)").eq("organization_id", DEMO_ORGANIZATION_ID).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*, customer:customers(*), items:invoice_items(*)").eq("organization_id", DEMO_ORGANIZATION_ID).order("created_at", { ascending: false }),
  ]);
  const error = customersResult.error || quotesResult.error || invoicesResult.error;
  if (error) throw error;
  return {
    customers: (customersResult.data ?? []) as Customer[],
    quotes: ((quotesResult.data ?? []) as unknown as Quote[]).map((quote) => ({ ...quote, items: [...(quote.items ?? [])].sort((a, b) => a.position - b.position) })),
    invoices: ((invoicesResult.data ?? []) as unknown as Invoice[]).map((invoice) => ({ ...invoice, items: [...(invoice.items ?? [])].sort((a, b) => a.position - b.position) })),
  };
}

export async function saveCustomer(input: CustomerInput, id?: string) {
  const payload = {
    organization_id: DEMO_ORGANIZATION_ID, kind: input.kind, company_name: input.company_name,
    civility: input.civility, last_name: input.last_name, first_name: input.first_name, siret: input.siret,
    vat_number: input.vat_number, emails: input.emails.filter(Boolean), phones: input.phones.filter(Boolean),
    addresses: input.addresses.filter((address) => address.line1 || address.city), notes: input.notes,
  };
  const query = id ? supabase.from("customers").update(payload).eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID) : supabase.from("customers").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}

function nextNumber(prefix: "DEV" | "FAC", numbers: string[]) {
  const year = new Date().getFullYear();
  const max = numbers.reduce((current, value) => { const match = value.match(/(\d+)$/); return Math.max(current, match ? Number(match[1]) : 0); }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

export async function saveQuote(input: DocumentInput, existingNumbers: string[], id?: string) {
  const totals = calculateTotals(input.items);
  const payload = {
    organization_id: DEMO_ORGANIZATION_ID, customer_id: input.customer_id, number: id ? undefined : nextNumber("DEV", existingNumbers),
    title: input.title?.trim() || "Travaux", status: input.status as QuoteStatus, issue_date: input.issue_date,
    expiry_date: input.expiry_date || null, subtotal: totals.subtotal, tax_total: totals.tax_total, total: totals.total,
    notes: input.notes, sent_at: input.status === "sent" ? new Date().toISOString() : null,
    accepted_at: input.status === "accepted" ? new Date().toISOString() : null,
  };
  let quoteId = id;
  if (id) {
    const { error } = await supabase.from("quotes").update(payload).eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
    if (error) throw error;
    const { error: itemsDeleteError } = await supabase.from("quote_items").delete().eq("quote_id", id);
    if (itemsDeleteError) throw itemsDeleteError;
  } else {
    const { data, error } = await supabase.from("quotes").insert(payload).select("id").single();
    if (error) throw error;
    quoteId = data.id;
  }
  const items = normalizeItems(input.items).map((item) => ({ ...item, quote_id: quoteId }));
  if (items.length > 0) { const { error } = await supabase.from("quote_items").insert(items); if (error) throw error; }
  return quoteId as string;
}

export async function deleteQuote(id: string) {
  const { error: itemError } = await supabase.from("quote_items").delete().eq("quote_id", id);
  if (itemError) throw itemError;
  const { error } = await supabase.from("quotes").delete().eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const { error } = await supabase.from("quotes").update({ status, sent_at: status === "sent" ? new Date().toISOString() : null, accepted_at: status === "accepted" ? new Date().toISOString() : null }).eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}

export async function saveInvoice(input: DocumentInput, existingNumbers: string[], id?: string) {
  const totals = calculateTotals(input.items);
  const payload = {
    organization_id: DEMO_ORGANIZATION_ID, customer_id: input.customer_id, quote_id: input.quote_id || null,
    number: id ? undefined : nextNumber("FAC", existingNumbers), status: input.status as InvoiceStatus,
    issue_date: input.issue_date, due_date: input.due_date || null, subtotal: totals.subtotal, tax_total: totals.tax_total,
    total: totals.total, paid_total: input.status === "paid" ? totals.total : 0, notes: input.notes,
    sent_at: input.status === "sent" || input.status === "issued" ? new Date().toISOString() : null,
  };
  let invoiceId = id;
  if (id) {
    const { error } = await supabase.from("invoices").update(payload).eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
    if (error) throw error;
    const { error: itemsDeleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
    if (itemsDeleteError) throw itemsDeleteError;
  } else {
    const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
    if (error) throw error;
    invoiceId = data.id;
  }
  const items = normalizeItems(input.items).map((item) => ({ ...item, invoice_id: invoiceId }));
  if (items.length > 0) { const { error } = await supabase.from("invoice_items").insert(items); if (error) throw error; }
  return invoiceId as string;
}

export async function deleteInvoice(id: string) {
  const { error: paymentError } = await supabase.from("payments").delete().eq("invoice_id", id);
  if (paymentError) throw paymentError;
  const { error: itemError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (itemError) throw itemError;
  const { error } = await supabase.from("invoices").delete().eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}

export async function markInvoicePaid(invoice: Invoice) {
  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.paid_total || 0));
  if (remaining > 0) {
    const { error: paymentError } = await supabase.from("payments").insert({ invoice_id: invoice.id, amount: remaining, paid_at: new Date().toISOString(), method: "virement", reference: "Paiement saisi dans l'application" });
    if (paymentError) throw paymentError;
  }
  const { error } = await supabase.from("invoices").update({ status: "paid", paid_total: invoice.total }).eq("id", invoice.id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
  const { error } = await supabase.from("invoices").update({ status, sent_at: status === "sent" || status === "issued" ? new Date().toISOString() : null }).eq("id", id).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw error;
}
