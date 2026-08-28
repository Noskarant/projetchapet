import assert from "node:assert/strict";
import test from "node:test";
import { getCopilotTradePack } from "../lib/copilot/trade-packs";
import type { UpholsteryDecoratorInterpretation } from "../lib/copilot/types";

function interpret(description: string) {
  return getCopilotTradePack("upholstery_decorator").interpretLocal(description) as UpholsteryDecoratorInterpretation;
}

test("tapissier : comprend enlèvement, retour, tissu client et galon fourni par l'atelier", () => {
  const result = interpret("Chez Mme Martin, deux fauteuils Voltaire à refaire entièrement en traditionnel, dégarnissage complet, tissu fourni par la cliente, le galon est fourni par moi, je viens les chercher et je les rapporte.");
  assert.equal(result.facts.itemCount, 2);
  assert.equal(result.facts.itemLabel, "Fauteuil Voltaire");
  assert.equal(result.facts.technique, "traditionnelle");
  assert.equal(result.facts.includeStripping, true);
  assert.equal(result.facts.fabricProvidedBy, "client");
  assert.equal(result.facts.includeTrim, true);
  assert.equal(result.facts.trimProvidedBy, "artisan");
  assert.equal(result.facts.includePickup, true);
  assert.equal(result.facts.includeDelivery, true);
  assert.equal(result.missingInformation.some((item) => item.includes("passementerie")), false);
});

test("tapissier : n'invente pas le métrage quand l'artisan fournit le tissu", () => {
  const result = interpret("Un fauteuil crapaud, dégarnissage puis garniture mousse et couverture, je fournis le tissu.");
  assert.equal(result.facts.itemCount, 1);
  assert.equal(result.facts.technique, "mousse");
  assert.equal(result.facts.fabricProvidedBy, "artisan");
  assert.equal(result.facts.fabricMeters, null);
  assert.ok(result.missingInformation.some((item) => item.includes("métrage")));
});

test("tapissier : accepte un métrage explicite sans transformer le prix", () => {
  const result = interpret("Deux bergères en traditionnel, 11,5 m de tissu fourni par l'atelier, passepoil client, livraison comprise.");
  assert.equal(result.facts.itemCount, 2);
  assert.equal(result.facts.fabricMeters, 11.5);
  assert.equal(result.facts.fabricProvidedBy, "artisan");
  assert.equal(result.facts.trimProvidedBy, "client");
  assert.equal(result.facts.includeDelivery, true);
});
