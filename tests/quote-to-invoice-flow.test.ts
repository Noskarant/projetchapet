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
  assert.equal(invoice.issueDate, new Date().toISOString().slice(0, 10));
  assert.equal(invoice.status, "En cours");
  assert.equal(invoice.subtotal, 388.5);
  assert.equal(invoice.taxTotal, 38.85);
  assert.equal(workspace.quotes[0].status, "Terminé");
  assert.equal(invoice.sourceQuoteId, quote.id);
  assert.equal(convertQuoteToInvoice(workspace, quote).workspace.invoices.length, 1);
});
