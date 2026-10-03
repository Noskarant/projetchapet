import test from "node:test";
import assert from "node:assert/strict";
import { seedMobileWorkspace, upsertCustomer, customerDisplayName } from "../lib/mobile-prototype";

test("corriger le client actualise ses devis et factures sans toucher leurs montants ni les autres clients", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  const customer = workspace.customers.find(item => item.id === quote.customerId)!;
  const invoice = { ...workspace.invoices[0], customerId: customer.id, customerName: quote.customerName };
  const before = { ...workspace, invoices: [invoice, ...workspace.invoices.slice(1)] };
  const changed = { ...customer, companyName: "Client orthographe corrigée", lastName: "Corrigé" };
  const updated = upsertCustomer(before, changed);
  assert.equal(updated.quotes[0].customerName, customerDisplayName(changed));
  assert.equal(updated.invoices[0].customerName, customerDisplayName(changed));
  assert.equal(updated.quotes[0].total, quote.total);
  assert.equal(updated.invoices[0].total, invoice.total);
  for (const other of before.quotes.filter(item => item.customerId !== customer.id)) {
    assert.deepEqual(updated.quotes.find(item => item.id === other.id), other);
  }
});
