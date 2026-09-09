import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  applyWorkspaceAliases,
  coreWorkspaceSignature,
  diffById,
  emptyWorkspaceAliases,
  invoiceStatusToMobile,
  mobileInvoiceStatusToDesktop,
  mobileQuoteStatusToDesktop,
  normalizedWorkspaceToMobile,
  quoteInputFromMobile,
  quoteStatusToMobile,
  stableSignature,
} from "../lib/mobile-desktop-sync";
import type { Customer, Quote } from "../lib/project-chapet";
import type { MobileWorkspace } from "../lib/mobile-prototype";

const customer: Customer = {
  id: "11111111-2222-4333-8444-555555555555",
  organization_id: "99999999-2222-4333-8444-555555555555",
  kind: "business",
  company_name: "Atelier Test",
  civility: null,
  last_name: null,
  first_name: null,
  siret: "12345678901234",
  vat_number: null,
  emails: ["contact@example.test"],
  phones: ["0102030405"],
  addresses: [{ line1: "1 rue du Test", postal_code: "69000", city: "Lyon" }],
  notes: null,
  created_at: "2026-09-09T10:00:00Z",
  updated_at: "2026-09-09T10:00:00Z",
};

const quote: Quote = {
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  organization_id: customer.organization_id,
  customer_id: customer.id,
  number: "DEV-2026-001",
  title: "Peinture séjour",
  status: "sent",
  issue_date: "2026-09-09",
  expiry_date: "2026-10-09",
  subtotal: 0,
  tax_total: 0,
  total: 0,
  notes: null,
  sent_at: "2026-09-09T10:00:00Z",
  accepted_at: null,
  created_at: "2026-09-09T10:00:00Z",
  updated_at: "2026-09-09T10:00:00Z",
  customer,
  items: [{
    id: "bbbbbbbb-2222-4333-8444-555555555555",
    position: 0,
    label: "Peinture des murs",
    description: null,
    quantity: null as unknown as number,
    unit: "m²",
    unit_price: null as unknown as number,
    tax_rate: null as unknown as number,
    total: 0,
  }],
};

const emptyMobile: MobileWorkspace = { customers: [], quotes: [], invoices: [], agenda: [] };

test("convertit le coeur Supabase en workspace mobile sans perdre les valeurs À préciser", () => {
  const previous: MobileWorkspace = {
    ...emptyMobile,
    agenda: [{ id: "agenda-1", date: "2026-09-10", time: "09:00", type: "Chantier", title: "Visite", customerId: customer.id, customerName: "Atelier Test", done: false }],
  };
  const mobile = normalizedWorkspaceToMobile({ customers: [customer], quotes: [quote], invoices: [] }, previous);
  assert.equal(mobile.customers[0].companyName, "Atelier Test");
  assert.equal(mobile.quotes[0].status, "En attente");
  assert.equal(mobile.quotes[0].items[0].quantity, null);
  assert.equal(mobile.quotes[0].items[0].unitPrice, null);
  assert.equal(mobile.quotes[0].items[0].taxRate, null);
  assert.equal(mobile.quotes[0].items[0].incomplete, true);
  assert.equal(mobile.agenda[0].title, "Visite");
});

test("préserve un statut serveur plus précis tant que le mobile ne le change pas", () => {
  assert.equal(quoteStatusToMobile("sent"), "En attente");
  assert.equal(mobileQuoteStatusToDesktop("En attente", "sent"), "sent");
  assert.equal(mobileQuoteStatusToDesktop("Validé", "sent"), "accepted");
  assert.equal(invoiceStatusToMobile("partially_paid"), "En cours");
  assert.equal(mobileInvoiceStatusToDesktop("En cours", "partially_paid"), "partially_paid");
  assert.equal(mobileInvoiceStatusToDesktop("Payée", "partially_paid"), "paid");
});

test("renvoie les null réels vers le RPC au lieu de fabriquer des zéros", () => {
  const mobile = normalizedWorkspaceToMobile({ customers: [customer], quotes: [quote], invoices: [] }, emptyMobile).quotes[0];
  const input = quoteInputFromMobile(mobile, customer.id, "sent");
  assert.equal(input.items[0].quantity, null);
  assert.equal(input.items[0].unit_price, null);
  assert.equal(input.items[0].tax_rate, null);
  assert.equal(input.status, "sent");
});

test("détecte créations modifications et suppressions sans tenir compte de l'ordre des clés", () => {
  const before = [{ id: "a", value: 1 }, { id: "b", value: 2 }];
  const after = [{ value: 3, id: "b" }, { id: "c", value: 4 }];
  const diff = diffById(before, after);
  assert.deepEqual(diff.created.map((item) => item.id), ["c"]);
  assert.deepEqual(diff.updated.map((item) => item.id), ["b"]);
  assert.deepEqual(diff.deleted.map((item) => item.id), ["a"]);
});

test("remappe les IDs locaux sans casser les relations client devis facture agenda", () => {
  const aliases = emptyWorkspaceAliases();
  aliases.customers.set("customer-local", customer.id);
  aliases.quotes.set("quote-local", quote.id);
  aliases.invoices.set("invoice-local", "cccccccc-2222-4333-8444-555555555555");

  const local: MobileWorkspace = {
    customers: [{ id: "customer-local", kind: "Professionnel", companyName: "Atelier Test", civility: "", lastName: "", firstName: "", emails: [], phones: [], address: "", postalCode: "", city: "", siret: "", vat: "", notes: "" }],
    quotes: [{ id: "quote-local", number: "D-2026-001", customerId: "customer-local", customerName: "Atelier Test", title: "Travaux", issueDate: "2026-09-09", expiryDate: "2026-10-09", status: "En attente", items: [], notes: "", subtotal: 0, taxTotal: 0, total: 0 }],
    invoices: [{ id: "invoice-local", number: "F-2026-001", customerId: "customer-local", customerName: "Atelier Test", title: "Travaux", issueDate: "2026-09-09", dueDate: "2026-10-09", status: "Brouillon", items: [], notes: "", subtotal: 0, taxTotal: 0, total: 0, paidTotal: 0, accountantSent: false, sourceQuoteId: "quote-local" }],
    agenda: [{ id: "agenda-local", date: "2026-09-10", time: "09:00", type: "Chantier", title: "Visite", customerId: "customer-local", customerName: "Atelier Test", done: false }],
  };

  const mapped = applyWorkspaceAliases(local, aliases);
  assert.equal(mapped.customers[0].id, customer.id);
  assert.equal(mapped.quotes[0].id, quote.id);
  assert.equal(mapped.quotes[0].customerId, customer.id);
  assert.equal(mapped.invoices[0].id, "cccccccc-2222-4333-8444-555555555555");
  assert.equal(mapped.invoices[0].customerId, customer.id);
  assert.equal(mapped.invoices[0].sourceQuoteId, quote.id);
  assert.equal(mapped.agenda[0].customerId, customer.id);
});

test("ignore les IDs, numéros et totaux générés pour éviter une resynchronisation en boucle", () => {
  const local = { id: "quote-local", number: "D-2026-001", customerName: "Atelier Test", title: "Peinture", subtotal: 0, taxTotal: 0, total: 0 };
  const canonical = { id: quote.id, number: "DEV-2026-001", customerName: "Atelier Test", title: "Peinture", subtotal: 100, taxTotal: 20, total: 120 };
  assert.equal(stableSignature(local), stableSignature(canonical));
});

test("la signature coeur ignore l'agenda qui reste synchronisé par le snapshot pilote", () => {
  const left = { ...emptyMobile, agenda: [] };
  const right = { ...emptyMobile, agenda: [{ id: "a", date: "2026-09-09", time: "10:00", type: "Chantier" as const, title: "Test", customerId: "", customerName: "", done: false }] };
  assert.equal(coreWorkspaceSignature(left), coreWorkspaceSignature(right));
});

test("la migration conserve les inconnues et ne réouvre aucun accès anonyme", () => {
  const sql = fs.readFileSync("supabase/migrations/20260909143000_preserve_incomplete_document_lines.sql", "utf8");
  assert.match(sql, /alter column quantity drop not null/i);
  assert.match(sql, /item->>'quantity' is null then null/i);
  assert.match(sql, /item->>'unit_price' is null then null/i);
  assert.match(sql, /revoke execute[\s\S]+from public, anon/i);
  assert.match(sql, /grant execute[\s\S]+to authenticated/i);
});
