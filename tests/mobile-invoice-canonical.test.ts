import assert from "node:assert/strict";
import test from "node:test";
import {
  findCanonicalMobileInvoice,
  sameMobileInvoiceIdentity,
} from "../lib/mobile-invoice-canonical";
import type { MobileInvoice, MobileWorkspace } from "../lib/mobile-prototype";

const invoice = (overrides: Partial<MobileInvoice> = {}): MobileInvoice => ({
  id: "invoice-local",
  number: "F-2026-001",
  customerId: "customer-1",
  customerName: "Atelier Martin",
  title: "Peinture séjour",
  issueDate: "2026-09-14",
  dueDate: "2026-10-14",
  status: "Brouillon",
  items: [],
  notes: "",
  subtotal: 100,
  taxTotal: 20,
  total: 120,
  paidTotal: 0,
  accountantSent: false,
  sourceQuoteId: "quote-1",
  ...overrides,
});

const workspace = (invoices: MobileInvoice[]): MobileWorkspace => ({
  customers: [],
  quotes: [],
  invoices,
  agenda: [],
});

test("retrouve la facture canonique grâce au devis source même si Supabase change ID et numéro", () => {
  const local = invoice();
  const canonical = invoice({
    id: "22897ca5-af50-41e0-bc71-b549f2080d79",
    number: "FAC-2026-002",
  });

  assert.equal(sameMobileInvoiceIdentity(local, canonical), true);
  assert.equal(
    findCanonicalMobileInvoice(workspace([local]), workspace([canonical]), local.number)?.number,
    "FAC-2026-002",
  );
});

test("ne dépend pas du même compteur local et serveur pour résoudre une conversion", () => {
  const local = invoice({ number: "F-2026-001" });
  const canonical = invoice({ id: "invoice-server", number: "FAC-2026-019" });

  assert.equal(
    findCanonicalMobileInvoice(workspace([local]), workspace([canonical]), "F-2026-001")?.id,
    "invoice-server",
  );
});

test("retombe sur la correspondance F vers FAC pour un ancien brouillon sans identité précédente", () => {
  const canonical = invoice({ id: "invoice-server", number: "FAC-2026-001", sourceQuoteId: undefined });
  assert.equal(
    findCanonicalMobileInvoice(workspace([]), workspace([canonical]), "F-2026-001")?.number,
    "FAC-2026-001",
  );
});

test("conserve une facture déjà canonique sans remappage", () => {
  const canonical = invoice({ id: "invoice-server", number: "FAC-2026-001" });
  assert.equal(
    findCanonicalMobileInvoice(workspace([canonical]), workspace([canonical]), "FAC-2026-001"),
    canonical,
  );
});
