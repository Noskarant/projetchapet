import assert from "node:assert/strict";
import test from "node:test";
import { convertQuoteToInvoice, normalizeQuote, type MobileWorkspace } from "../lib/mobile-prototype";

test("la transformation crée tout de suite une facture datée du jour et termine le devis", () => {
  const quote = normalizeQuote({
    id: "quote-local", number: "D-2026-001", customerId: "customer-local", customerName: "Client",
    title: "Peinture", issueDate: "2026-09-01", expiryDate: "2026-10-01", status: "Validé",
    items: [{ id: "line-1", label: "Pose", description: "", quantity: 18.5, unit: "m²", unitPrice: 21, taxRate: 10 }],
    notes: "", subtotal: 0, taxTotal: 0, total: 0,
  });
  const initial: MobileWorkspace = { customers: [], quotes: [quote], invoices: [], agenda: [] };
  const { workspace, invoice } = convertQuoteToInvoice(initial, quote);
  const now = new Date();
  assert.equal(invoice.issueDate, new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  assert.equal(invoice.status, "En cours");
  assert.equal(invoice.subtotal, 388.5);
  assert.equal(invoice.taxTotal, 38.85);
  assert.equal(workspace.quotes[0].status, "Terminé");
  assert.equal(invoice.sourceQuoteId, quote.id);
  assert.equal(convertQuoteToInvoice(workspace, quote).workspace.invoices.length, 1);
});

test("un devis terminé reste facturable et rouvrir sa facture conserve son numéro et sa date", () => {
  const quote = normalizeQuote({
    id: "completed-quote", number: "D-2026-002", customerId: "customer-local", customerName: "Client",
    title: "Peinture terminée", issueDate: "2026-09-01", expiryDate: "2026-10-01", status: "Terminé",
    items: [{ id: "line-1", label: "Pose", description: "Deux couches", quantity: 18.5, unit: "m²", unitPrice: 21, taxRate: 10 }],
    notes: "Mission assurance", subtotal: 0, taxTotal: 0, total: 0,
  });
  const initial: MobileWorkspace = { customers: [], quotes: [quote], invoices: [], agenda: [] };
  const created = convertQuoteToInvoice(initial, quote, 4);
  assert.equal(created.invoice.sourceQuoteId, quote.id);
  assert.equal(created.invoice.customerId, quote.customerId);
  assert.equal(created.invoice.notes, quote.notes);
  assert.equal(created.invoice.items[0].description, quote.items[0].description);
  assert.equal(created.invoice.subtotal, 372.96);
  const previous = { ...created.invoice, issueDate: "2026-09-30" };
  const saved = { ...created.workspace, invoices: [previous] };
  const reopened = convertQuoteToInvoice(saved, quote, 10);
  assert.equal(reopened.workspace, saved);
  assert.equal(reopened.invoice, previous);
  assert.equal(reopened.workspace.invoices.length, 1);
});
