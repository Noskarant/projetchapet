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
  signer_name?: string | null; signature_data?: string | null; signed_at?: string | null;
  customer: Customer; items: DocumentItem[];
};

export type Invoice = {
  id: string; organization_id: string; customer_id: string; quote_id: string | null; number: string; status: InvoiceStatus;
  issue_date: string; due_date: string | null; subtotal: number; tax_total: number; total: number; paid_total: number;
  notes: string | null; sent_at: string | null; created_at: string; updated_at: string;
  e_invoice_status?: string; e_invoice_provider?: string | null; e_invoice_reference?: string | null; e_invoice_payload?: Record<string, unknown>;
  customer: Customer; items: DocumentItem[];
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

export async function getActiveOrganizationId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return DEMO_ORGANIZATION_ID;
  const { data, error } = await supabase.rpc("ensure_personal_organization");
  if (error) throw error;
  return data as string;
}

export async function fetchWorkspace() {
  const organizationId = await getActiveOrganizationId();
  const [customersResult, quotesResult, invoicesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("quotes").select("*, customer:customers(*), items:quote_items(*)").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*, customer:customers(*), items:invoice_items(*)").eq("organization_id", organizationId).order("created_at", { ascending: false }),
  ]);
  const error = customersResult.error || quotesResult.error || invoicesResult.error;
  if (error) throw error;
  return {
    organizationId,
    customers: (customersResult.data ?? []) as Customer[],
    quotes: ((quotesResult.data ?? []) as unknown as Quote[]).map((quote) => ({ ...quote, items: [...(quote.items ?? [])].sort((a, b) => a.position - b.position) })),
    invoices: ((invoicesResult.data ?? []) as unknown as Invoice[]).map((invoice) => ({ ...invoice, items: [...(invoice.items ?? [])].sort((a, b) => a.position - b.position) })),
  };
}

export async function saveCustomer(input: CustomerInput, id?: string) {
  const organizationId = await getActiveOrganizationId();
  const payload = {
    organization_id: organizationId, kind: input.kind, company_name: input.company_name,
    civility: input.civility, last_name: input.last_name, first_name: input.first_name, siret: input.siret,
    vat_number: input.vat_number, emails: input.emails.filter(Boolean), phones: input.phones.filter(Boolean),
    addresses: input.addresses.filter((address) => address.line1 || address.city), notes: input.notes,
  };
  const query = id ? supabase.from("customers").update(payload).eq("id", id).eq("organization_id", organizationId) : supabase.from("customers").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("customers").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

export async function saveQuote(input: DocumentInput, existingNumbers: string[], id?: string) {
  void existingNumbers;
  const { data, error } = await supabase.rpc("save_quote_document", {
    p_quote_id: id ?? null,
    p_customer_id: input.customer_id,
    p_title: input.title?.trim() || "Travaux",
    p_status: input.status as QuoteStatus,
    p_issue_date: input.issue_date,
    p_expiry_date: input.expiry_date || null,
    p_notes: input.notes,
    p_items: normalizeItems(input.items),
  });
  if (error) throw error;
  return data as string;
}

export async function deleteQuote(id: string) {
  const { error } = await supabase.rpc("delete_quote_document", { p_quote_id: id });
  if (error) throw error;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("quotes").update({ status, sent_at: status === "sent" ? new Date().toISOString() : null, accepted_at: status === "accepted" ? new Date().toISOString() : null }).eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

export async function saveQuoteSignature(id: string, signerName: string, signatureData: string) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("quotes").update({ signer_name: signerName, signature_data: signatureData, signed_at: new Date().toISOString(), status: "accepted" }).eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

export async function saveInvoice(input: DocumentInput, existingNumbers: string[], id?: string) {
  void existingNumbers;
  const { data, error } = await supabase.rpc("save_invoice_document", {
    p_invoice_id: id ?? null,
    p_customer_id: input.customer_id,
    p_quote_id: input.quote_id || null,
    p_status: input.status as InvoiceStatus,
    p_issue_date: input.issue_date,
    p_due_date: input.due_date || null,
    p_notes: input.notes,
    p_items: normalizeItems(input.items),
  });
  if (error) throw error;
  return data as string;
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase.rpc("delete_invoice_draft", { p_invoice_id: id });
  if (error) throw error;
}

export async function markInvoicePaid(invoice: Invoice) {
  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.paid_total || 0));
  if (remaining <= 0) return;
  const { error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoice.id,
    p_amount: remaining,
    p_paid_at: new Date().toISOString(),
    p_method: "virement",
    p_reference: "Paiement saisi dans l'application",
  });
  if (error) throw error;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("invoices").update({ status, sent_at: status === "sent" || status === "issued" ? new Date().toISOString() : null }).eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

export async function saveEInvoicePreparation(id: string, payload: Record<string, unknown>, provider = "À choisir") {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("invoices").update({ e_invoice_status: "ready_for_provider", e_invoice_provider: provider, e_invoice_payload: payload }).eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}
