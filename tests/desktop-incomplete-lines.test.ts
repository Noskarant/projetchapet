import assert from "node:assert/strict";
import test from "node:test";
import { preserveOmittedUnknownQuantityItems, type DocumentItem } from "../lib/project-chapet";

const complete: DocumentItem = {
  id: "line-complete",
  position: 0,
  label: "Préparation des murs",
  description: null,
  quantity: 10,
  unit: "m²",
  unit_price: 12,
  tax_rate: 10,
  total: 120,
};

const unknownQuantity: DocumentItem = {
  id: "line-unknown",
  position: 1,
  label: "Protection du mobilier",
  description: null,
  quantity: null as unknown as number,
  unit: "forfait",
  unit_price: null as unknown as number,
  tax_rate: 10,
  total: 0,
};

test("une édition desktop ne supprime pas une ligne À préciser filtrée par l'ancien formulaire", () => {
  const merged = preserveOmittedUnknownQuantityItems([complete], [complete, unknownQuantity]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "line-complete");
  assert.equal(merged[1].id, "line-unknown");
  assert.equal(merged[1].quantity, null);
});

test("le garde-fou ne réintroduit pas une ligne complète réellement supprimée", () => {
  const removedComplete = { ...complete, id: "line-removed", position: 1 };
  const merged = preserveOmittedUnknownQuantityItems([complete], [complete, removedComplete]);
  assert.deepEqual(merged.map((item) => item.id), ["line-complete"]);
});

test("un payload mobile sans IDs SQL reste libre de supprimer une ligne incomplète", () => {
  const mobileLine: DocumentItem = { ...complete, id: undefined };
  const merged = preserveOmittedUnknownQuantityItems([mobileLine], [complete, unknownQuantity]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, undefined);
});
