import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCompanyRulesForTrade,
  companyRuleAuditPayload,
  createCompanyRule,
  promoteCorrectionToCompanyRule,
} from "../lib/copilot/company-rules";

test("une règle entreprise reste attachée à son métier", () => {
  const painting = createCompanyRule("interior_painting", "Toujours inclure la protection des sols.", "painting-1");
  const upholstery = createCompanyRule("upholstery_decorator", "Le tissu client n’est jamais refacturé.", "upholstery-1");
  assert.ok(painting);
  assert.ok(upholstery);
  const active = activeCompanyRulesForTrade([painting, upholstery], "upholstery_decorator");
  assert.deepEqual(active.map((rule) => rule.id), ["upholstery-1"]);
});

test("une correction validée peut être promue en règle sans interpréter son prix", () => {
  const correction = {
    id: "abc-123",
    trade: "upholstery_decorator" as const,
    fieldName: "fabricProvidedBy",
    validatedValue: "client",
    context: { item: "Voltaire" },
  };
  const rule = promoteCorrectionToCompanyRule(correction, "Quand le devis dit tissu client, ne pas ajouter de fourniture de tissu.");
  assert.ok(rule);
  assert.equal(rule.trade, "upholstery_decorator");
  assert.equal(rule.id, "correction-abc-123");
  assert.deepEqual(companyRuleAuditPayload(correction), {
    correction_id: "abc-123",
    trade: "upholstery_decorator",
    field_name: "fabricProvidedBy",
    validated_value: "client",
    context: { item: "Voltaire" },
  });
});

test("une règle vide est refusée", () => {
  assert.equal(createCompanyRule("interior_painting", "   "), null);
});
