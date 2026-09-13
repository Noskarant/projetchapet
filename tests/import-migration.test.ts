import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportPreview,
  detectDelimiter,
  inferImportEntityType,
  parseDelimitedText,
} from "../lib/import-migration";

test("détecte et lit un export client français séparé par point-virgule", () => {
  const csv = "Raison sociale;SIRET;Email;Téléphone;Adresse;Code postal;Ville\nMartin Peinture;89244511200018;contact@martin.fr;0612345678;12 rue de la République;42000;Saint-Étienne";
  assert.equal(detectDelimiter(csv), ";");
  const preview = buildImportPreview(csv);
  assert.equal(preview.entityType, "customers");
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].normalizedData.company_name, "Martin Peinture");
  assert.equal(preview.rows[0].normalizedData.siret, "89244511200018");
  assert.equal(preview.rows[0].validationErrors.length, 0);
});

test("gère les guillemets et séparateurs inclus dans une cellule", () => {
  const csv = 'Nom;Notes\nDupont;"Client à rappeler; après 18h"';
  const rows = parseDelimitedText(csv, ";");
  assert.equal(rows[1][1], "Client à rappeler; après 18h");
});

test("reconnaît un catalogue et convertit les nombres français", () => {
  const csv = "Désignation;Unité;Prix vente;TVA\nPeinture mate;m²;18,50;10";
  const preview = buildImportPreview(csv);
  assert.equal(inferImportEntityType(preview.headers), "catalog");
  assert.equal(preview.entityType, "catalog");
  assert.equal(preview.rows[0].normalizedData.label, "Peinture mate");
  assert.equal(preview.rows[0].normalizedData.unit_price, 18.5);
  assert.equal(preview.rows[0].normalizedData.tax_rate, 10);
});

test("signale un SIRET invalide avant toute écriture métier", () => {
  const csv = "Raison sociale;SIRET\nEntreprise Test;123";
  const preview = buildImportPreview(csv, "customers");
  assert.deepEqual(preview.rows[0].validationErrors, ["SIRET invalide."]);
});
