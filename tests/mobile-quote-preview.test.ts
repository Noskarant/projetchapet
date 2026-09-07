import assert from "node:assert/strict";
import test from "node:test";
import {
  QUOTE_META_STORAGE_KEY,
  calculateQuotePreviewTotals,
  readQuoteInternalMeta,
  writeQuoteInternalMeta,
} from "../lib/mobile-quote-preview";
import type { LineItem } from "../lib/mobile-prototype";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const items: LineItem[] = [
  {
    id: "1",
    label: "Peinture",
    description: "",
    quantity: 10,
    unit: "m²",
    unitPrice: 40,
    taxRate: 10,
  },
  {
    id: "2",
    label: "Préparation",
    description: "",
    quantity: 1,
    unit: "forfait",
    unitPrice: 100,
    taxRate: 20,
  },
];

test("calcule la remise sur le HT et la TVA correspondante", () => {
  const totals = calculateQuotePreviewTotals(items, 10);
  assert.deepEqual(totals, {
    grossSubtotal: 500,
    discountPercent: 10,
    discountAmount: 50,
    subtotal: 450,
    taxTotal: 54,
    total: 504,
  });
});

test("borne une remise invalide", () => {
  assert.equal(calculateQuotePreviewTotals(items, -15).discountPercent, 0);
  assert.equal(calculateQuotePreviewTotals(items, 140).discountPercent, 100);
});

test("ignore les lignes incompletes sans confondre un vrai zero explicite", () => {
  const totals = calculateQuotePreviewTotals(
    [
      {
        id: "known",
        label: "Peinture",
        description: "",
        quantity: 42,
        unit: "m²",
        unitPrice: 32,
        taxRate: 10,
      },
      {
        id: "unknown",
        label: "Protection chantier",
        description: "",
        quantity: null,
        unit: null,
        unitPrice: null,
        taxRate: null,
        incomplete: true,
        provenance: "unknown",
      },
      {
        id: "free",
        label: "Geste commercial",
        description: "",
        quantity: 1,
        unit: "forfait",
        unitPrice: 0,
        taxRate: 10,
        provenance: "user_explicit",
      },
    ],
    0,
  );

  assert.equal(totals.grossSubtotal, 1344);
  assert.equal(totals.taxTotal, 134.4);
  assert.equal(totals.total, 1478.4);
});

test("conserve les notes personnelles dans un stockage séparé", () => {
  const storage = new MemoryStorage();
  writeQuoteInternalMeta(storage, "D-2026-388", {
    discountPercent: 4,
    internalNotes: "Sous-traitant Martin — devis 1 850 €",
  });

  assert.deepEqual(readQuoteInternalMeta(storage, "D-2026-388"), {
    discountPercent: 4,
    internalNotes: "Sous-traitant Martin — devis 1 850 €",
  });
  assert.ok(storage.getItem(QUOTE_META_STORAGE_KEY));
});
