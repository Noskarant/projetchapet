import assert from "node:assert/strict";
import test from "node:test";
import { appendSuggestionsWithoutInventing, suggestRappidosExtras } from "../lib/rappidos-suggestions";

test("propose la protection et la préparation pour une peinture sans les inventer dans le devis", () => {
  const suggestions = suggestRappidosExtras("Peindre 42 m² de murs et le plafond du séjour avec deux couches");
  assert.ok(suggestions.some((item) => item.id === "site_protection"));
  assert.ok(suggestions.some((item) => item.id === "surface_preparation"));
});

test("ne repropose pas un poste déjà dicté", () => {
  const suggestions = suggestRappidosExtras("Peindre la façade avec échafaudage et protection des sols");
  assert.equal(suggestions.some((item) => item.id === "scaffolding"), false);
  assert.equal(suggestions.some((item) => item.id === "site_protection"), false);
});

test("propose un moyen d'accès pour une façade", () => {
  const suggestions = suggestRappidosExtras("Ravalement et peinture de la façade du bâtiment");
  assert.ok(suggestions.some((item) => item.id === "scaffolding"));
});

test("les suggestions ajoutées n'inventent ni quantité ni prix ni TVA", () => {
  const suggestion = suggestRappidosExtras("Dépose et réfection complète d'une salle de bain").find((item) => item.id === "waste_disposal");
  assert.ok(suggestion);
  const lines = appendSuggestionsWithoutInventing([], [suggestion!]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 0);
  assert.equal(lines[0].unit_price, 0);
  assert.equal(lines[0].tax_rate, 0);
});
