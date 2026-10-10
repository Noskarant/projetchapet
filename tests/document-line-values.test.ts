import test from "node:test";
import assert from "node:assert/strict";
import { documentLineValues } from "../lib/document-line-values";
import { applyMobileVoiceCommand, fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from "../lib/mobile-voice-command";
import { seedMobileWorkspace } from "../lib/mobile-prototype";

test("un poste sans prix garde sa quantité mais masque sa TVA sans modifier les données", () => {
  const item = { quantity: 2, unitPrice: null, taxRate: 10 };
  assert.deepEqual(documentLineValues(item), { quantity: 2, unitPrice: null, taxRate: null, total: null });
  assert.equal(item.taxRate, 10);
  assert.deepEqual(documentLineValues({ quantity: null, unitPrice: undefined, taxRate: 20 }), { quantity: null, unitPrice: null, taxRate: null, total: null });
});

test("un prix explicite à zéro reste visible, ainsi que la TVA à zéro", () => {
  assert.deepEqual(documentLineValues({ quantity: 1, unitPrice: 0, taxRate: 0 }), { quantity: 1, unitPrice: 0, taxRate: 0, total: 0 });
  assert.deepEqual(documentLineValues({ quantity: 42.08, unitPrice: 22.5, taxRate: 10 }), { quantity: 42.08, unitPrice: 22.5, taxRate: 10, total: 946.8 });
});

test("supprimer la mention À préciser à la voix est compris sans supprimer des postes ni modifier les montants", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  for (const text of ["Supprime la mention à préciser", "Enlève à préciser et la TVA sur les lignes sans prix", "Masque la mention à préciser sur le devis"]) {
    const fallback = fallbackMobileVoiceCommand(text, { entity: "quote", id: quote.id, data: quote }, workspace);
    assert.equal(fallback.display_only, true);
    assert.match(fallback.summary, /montants sont conservés/);
    const command = sanitizeMobileVoiceCommand({ changes: { notes: "" }, line_operations: [{ action: "delete", line_id: quote.items[0].id }] }, fallback);
    assert.equal(command, fallback);
    assert.equal(applyMobileVoiceCommand(workspace, command), workspace);
  }
});

test("une instruction financière ou une négation n’est pas traitée comme une simple demande d’affichage", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  for (const text of ["Supprime la mention à préciser et mets un prix de 300 euros", "Ne supprime pas à préciser", "Supprime la ligne à préciser", "Enlève la TVA", "Ajoute une prestation sans à préciser"]) {
    assert.notEqual(fallbackMobileVoiceCommand(text, { entity: "quote", id: quote.id, data: quote }, workspace).display_only, true);
  }
});
