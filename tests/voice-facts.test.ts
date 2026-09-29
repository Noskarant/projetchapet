import assert from "node:assert/strict";
import test from "node:test";
import {
  explicitPrice,
  explicitQuantity,
  normalizeVoiceTranscript,
  normalizeSpokenEmail,
  roomQuantityEvidence,
  spokenPriceType,
} from "../lib/voice-facts";

test("conserve les décimales françaises et les lettres explicitement épelées", () => {
  assert.equal(normalizeVoiceTranscript("18 mètres 50 à 21 euros HT"), "18,50 mètres à 21 euros HT");
  assert.equal(normalizeVoiceTranscript("18,50 m² à 21 euros"), "18,50 m² à 21 euros");
  assert.equal(normalizeVoiceTranscript("18 virgule 50 m² et 21 euros 50"), "18,50 m² et 21,50 euros");
  assert.equal(normalizeVoiceTranscript("prénom P I E R R E, nom V I G N O N"), "prénom PIERRE, nom VIGNON");
  assert.equal(normalizeVoiceTranscript("Pierre s'épelle P I E R R E"), "Pierre s'épelle PIERRE");
  assert.equal(explicitQuantity("18,50 mètres carrés"), 18.5);
  assert.equal(explicitPrice("à 21,50 euros TTC"), 21.5);
  assert.equal(spokenPriceType("21 euros hors taxes"), "ht");
  assert.equal(spokenPriceType("21 euros toutes taxes comprises"), "ttc");
});

test("restaure une arobase dictée et ne devine pas une adresse ambiguë", () => {
  assert.equal(normalizeVoiceTranscript("julien point morel arobase exemple point com"), "julien point morel @ exemple point com");
  assert.equal(normalizeSpokenEmail("julien point morel arobase exemple point com"), "julien.morel@exemple.com");
  assert.equal(normalizeSpokenEmail("julien.morel.exemple.com"), "julien.morel@exemple.com");
  assert.equal(normalizeSpokenEmail("jean.dupont.societe.fr"), "jean.dupont.societe.fr");
  assert.equal(normalizeSpokenEmail("jean.dupont.societe.fr", "E-mail jean.dupont@societe.fr"), "jean.dupont@societe.fr");
});

test("rattache le métrage à la chambre dictée sans le reporter sur le couloir", () => {
  const spoken = normalizeVoiceTranscript("Couloir, plafond sans surface. Chambre numéro 2, plafond 18 mètres 50 à 21 euros hors taxes. Chambre 3, 11 m² à 21 euros.");
  const quantities = roomQuantityEvidence(spoken, [
    "Remplacement papier peint - Couloir, plafond",
    "Remplacement papier peint - Chambre 2, plafond",
    "Remplacement papier peint - Chambre 3, plafond",
  ]);
  assert.deepEqual(quantities, [null, 18.5, 11]);
});

test("ne réattribue pas une surface quand la pièce apparaît plusieurs fois", () => {
  const values = roomQuantityEvidence("Chambre 2 18,50 m². Chambre 2 2 m² de reprise. Couloir 12 m².", ["Chambre 2 plafond", "Couloir plafond"]);
  assert.deepEqual(values, [undefined, 12]);
});
