import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeActionProposal,
  riskLevelForIntent,
} from "../lib/action-engine";

test("les actions financières ou externes exigent une confirmation explicite", () => {
  assert.equal(riskLevelForIntent("prepare_invoice"), "explicit_confirmation");
  assert.equal(riskLevelForIntent("mark_payment"), "explicit_confirmation");
  assert.equal(riskLevelForIntent("prepare_email"), "explicit_confirmation");
  assert.equal(riskLevelForIntent("prepare_supplier_order"), "explicit_confirmation");
});

test("une action sensible ne peut pas être abaissée en risque faible", () => {
  const proposal = normalizeActionProposal({
    organizationId: "org-1",
    sourceType: "voice",
    intentType: "prepare_invoice",
    payload: { customer: "Dupont" },
    riskLevel: "low",
    confidence: 0.9,
  });
  assert.equal(proposal.riskLevel, "explicit_confirmation");
  assert.equal(proposal.status, "ready");
});

test("les champs manquants bloquent la proposition en needs_input", () => {
  const proposal = normalizeActionProposal({
    organizationId: "org-1",
    sourceType: "voice",
    intentType: "prepare_quote",
    payload: { title: "Peinture salon" },
    confidence: 1.4,
    warnings: ["TVA à confirmer", "TVA à confirmer"],
    missingFields: ["customer_id", "tax_rate", "customer_id"],
  });
  assert.equal(proposal.status, "needs_input");
  assert.equal(proposal.confidence, 1);
  assert.deepEqual(proposal.warnings, ["TVA à confirmer"]);
  assert.deepEqual(proposal.missingFields, ["customer_id", "tax_rate"]);
});
