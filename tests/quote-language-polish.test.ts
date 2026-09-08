import assert from "node:assert/strict";
import test from "node:test";
import { polishFrenchTradeDesignation, polishQuoteItems } from "../lib/quote-language-polish";

test("corrige uniquement des fautes typographiques BTP sûres", () => {
  assert.equal(polishFrenchTradeDesignation("peinture des plaintes"), "Peinture des plinthes");
  assert.equal(polishFrenchTradeDesignation("preparation et sous couche facade"), "Préparation et sous-couche façade");
  assert.equal(polishFrenchTradeDesignation("depose echafaudage et evacuation"), "Dépose échafaudage et évacuation");
  assert.equal(polishFrenchTradeDesignation("main d oeuvre electricite"), "Main-d’œuvre électricité");
  assert.equal(polishFrenchTradeDesignation("reagreage et etancheite"), "Ragréage et étanchéité");
});

test("ne modifie jamais les valeurs métier du devis", () => {
  const source = [{
    label: "preparation facade",
    quantity: 42,
    unit: "m²",
    unit_price: 32,
    tax_rate: 10,
    confidence: 0.91,
  }];

  const polished = polishQuoteItems(source)!;
  assert.equal(polished[0]?.label, "Préparation façade");
  assert.equal(polished[0]?.quantity, 42);
  assert.equal(polished[0]?.unit, "m²");
  assert.equal(polished[0]?.unit_price, 32);
  assert.equal(polished[0]?.tax_rate, 10);
  assert.equal(polished[0]?.confidence, 0.91);
  assert.deepEqual(source, [{ label: "preparation facade", quantity: 42, unit: "m²", unit_price: 32, tax_rate: 10, confidence: 0.91 }]);
});

test("conserve les inconnues nulles", () => {
  const polished = polishQuoteItems([{ label: "echafaudage", quantity: null, unit: null, unit_price: null, tax_rate: null }])!;
  assert.deepEqual(polished[0], {
    label: "Échafaudage",
    quantity: null,
    unit: null,
    unit_price: null,
    tax_rate: null,
  });
});
