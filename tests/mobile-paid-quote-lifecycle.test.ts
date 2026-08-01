import assert from "node:assert/strict";
import test from "node:test";
import { convertQuoteToInvoice, seedMobileWorkspace, upsertInvoice } from "../lib/mobile-prototype";

test("un devis validé reste accepté après sa transformation en facture", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes.find((item) => item.id === "Q-377");
  assert.ok(quote);
  assert.equal(quote.status, "Validé");

  const withoutExistingInvoice = {
    ...workspace,
    invoices: workspace.invoices.filter((invoice) => invoice.sourceQuoteId !== quote.id),
  };
  const result = convertQuoteToInvoice(withoutExistingInvoice, quote);
  const storedQuote = result.workspace.quotes.find((item) => item.id === quote.id);

  assert.equal(storedQuote?.status, "Validé");
  assert.equal(result.invoice.sourceQuoteId, quote.id);
  assert.equal(result.invoice.status, "Brouillon");
});

test("le paiement retire le devis du filtre Validé sans le supprimer de l’historique", () => {
  const workspace = seedMobileWorkspace();
  const invoice = workspace.invoices.find((item) => item.sourceQuoteId === "Q-377");
  assert.ok(invoice);

  const updated = upsertInvoice(workspace, {
    ...invoice,
    status: "Payée",
    paidTotal: invoice.total,
  });

  const quote = updated.quotes.find((item) => item.id === "Q-377");
  assert.ok(quote, "le devis doit rester dans la base générale");
  assert.equal(quote.status, "Terminé");
  assert.equal(updated.quotes.filter((item) => item.status === "Validé").some((item) => item.id === "Q-377"), false);
  assert.equal(updated.quotes.some((item) => item.id === "Q-377"), true);
});
