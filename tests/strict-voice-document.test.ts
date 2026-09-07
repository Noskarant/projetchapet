import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackStrictVoiceDocument,
  filterSpeechNoise,
  normalizeStrictVoiceDocument,
  resolveContextClient,
  strictDocumentToLegacy,
} from "../lib/strict-voice-document";

const contextClients = [
  "M. Dupont-Jacques",
  "Mme SOULIER Françoise",
  "SCI BELLEVUE",
];

test("rattache Monsieur au client M. avec un nom composé", () => {
  const result = resolveContextClient(contextClients, "Monsieur dupont jacques");
  assert.deepEqual(result, { status: "matched", name: "M. Dupont-Jacques" });
});

test("tolère une transcription phonétique légère mais refuse de deviner entre homonymes", () => {
  const matched = resolveContextClient(contextClients, "Monsieur Dupont Jacque");
  assert.equal(matched.status, "matched");
  assert.equal(matched.name, "M. Dupont-Jacques");

  const ambiguous = resolveContextClient(["M. Dupont-Jacques", "M. Dupont-Martin"], "Monsieur Dupont");
  assert.equal(ambiguous.status, "ambiguous");
});

test("la dernière version d’une prestation remplace les doublons du JSON IA", () => {
  const result = normalizeStrictVoiceDocument({
    client: { nom: "Monsieur Dupont-Jacques" },
    prestations: [
      { designation: "Peinture murs", quantite: 20, unite: "m2", prix_unitaire_ht: 30, taux_tva: 10 },
      { designation: "Peinture murs", quantite: 25, unite: "m2", prix_unitaire_ht: 32, taux_tva: 10 },
    ],
  }, contextClients);

  assert.equal(result.client.nom, "M. Dupont-Jacques");
  assert.equal(result.prestations.length, 1);
  assert.deepEqual(result.prestations[0], {
    designation: "Peinture murs",
    quantite: 25,
    unite: "m2",
    prix_unitaire_ht: 32,
    taux_tva: 10,
  });
});

test("le secours local applique la dernière quantité et le dernier prix", () => {
  const result = fallbackStrictVoiceDocument(
    "Client Monsieur Dupont-Jacques, euh peinture des murs 20 m2 à 30 euros. Non attends plutôt 25 m2 à 32 euros. Bref TVA 10 %.",
    contextClients,
  );

  assert.equal(result.client.nom, "M. Dupont-Jacques");
  assert.equal(result.prestations.length, 1);
  assert.equal(result.prestations[0]?.quantite, 25);
  assert.equal(result.prestations[0]?.prix_unitaire_ht, 32);
  assert.equal(result.prestations[0]?.taux_tva, 10);
  assert.match(result.prestations[0]?.designation ?? "", /peinture des murs/i);
  assert.doesNotMatch(result.prestations[0]?.designation ?? "", /dupont/i);
});

test("une ligne annulée disparaît totalement et la nouvelle ligne reste seule", () => {
  const result = fallbackStrictVoiceDocument(
    "Pour Madame Soulier, ajoute dépose ancien papier 1 forfait à 450 euros. Non oublie la dépose. Plutôt préparation du support 2 h à 40 euros, TVA 10 %.",
    contextClients,
  );

  assert.equal(result.client.nom, "Mme SOULIER Françoise");
  assert.equal(result.prestations.length, 1);
  assert.match(result.prestations[0]?.designation ?? "", /préparation du support|preparation du support/i);
  assert.equal(result.prestations[0]?.quantite, 2);
  assert.equal(result.prestations[0]?.unite, "h");
  assert.equal(result.prestations[0]?.prix_unitaire_ht, 40);
  assert.doesNotMatch(JSON.stringify(result), /ancien papier|450/);
});

test("le dernier client énoncé remplace le précédent", () => {
  const result = fallbackStrictVoiceDocument(
    "Client Monsieur Dupont-Jacques. Non finalement client Madame Soulier. Peinture plafond 12 m2 à 35 euros TVA 10 %.",
    contextClients,
  );
  assert.equal(result.client.nom, "Mme SOULIER Françoise");
});

test("filtre le bruit et le parlé parasite", () => {
  const cleaned = filterSpeechNoise("Euh bref du coup peinture 10 m2, tu vois, à 20 euros quoi.");
  assert.doesNotMatch(cleaned, /euh|bref|du coup|tu vois|quoi/i);
  assert.match(cleaned, /peinture 10 m2/i);
});

test("convertit le JSON strict vers le format interne sans notes parasites", () => {
  const legacy = strictDocumentToLegacy({
    client: { nom: "SCI BELLEVUE" },
    prestations: [{
      designation: "Ratissage complet",
      quantite: 18,
      unite: "m2",
      prix_unitaire_ht: 28,
      taux_tva: 10,
    }],
  });

  assert.equal(legacy.customer_hint, "SCI BELLEVUE");
  assert.equal(legacy.notes, "");
  assert.equal(legacy.items[0]?.unit, "m²");
  assert.equal(legacy.items[0]?.unit_price, 28);
});
