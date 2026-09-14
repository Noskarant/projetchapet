import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportPreview,
  catalogDuplicateKey,
  detectDelimiter,
  inferImportEntityType,
  normalizeImportRow,
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
  const csv = "Désignation;Unité;Prix vente;Prix achat;TVA\nPeinture mate;m²;18,50;9,25;10";
  const preview = buildImportPreview(csv);
  assert.equal(inferImportEntityType(preview.headers), "catalog");
  assert.equal(preview.entityType, "catalog");
  assert.equal(preview.rows[0].normalizedData.label, "Peinture mate");
  assert.equal(preview.rows[0].normalizedData.unit_price, 18.5);
  assert.equal(preview.rows[0].normalizedData.cost_price, 9.25);
  assert.equal(preview.rows[0].normalizedData.tax_rate, 10);
});

test("signale un SIRET invalide avant toute écriture métier", () => {
  const csv = "Raison sociale;SIRET\nEntreprise Test;123";
  const preview = buildImportPreview(csv, "customers");
  assert.deepEqual(preview.rows[0].validationErrors, ["SIRET invalide."]);
});

test("respecte un mapping manuel au lieu de l'inférence automatique", () => {
  const csv = "A;B;C\nDupont;Jean;jean@dupont.fr";
  const preview = buildImportPreview(csv, "customers", {
    last_name: "A",
    first_name: "B",
    email: "C",
  });
  assert.equal(preview.mapping.last_name, "A");
  assert.equal(preview.rows[0].normalizedData.last_name, "Dupont");
  assert.equal(preview.rows[0].normalizedData.first_name, "Jean");
  assert.equal(preview.rows[0].normalizedData.email, "jean@dupont.fr");
});

test("ignore un mapping manuel vers une colonne absente", () => {
  const csv = "Nom;Email\nDupont;jean@dupont.fr";
  const preview = buildImportPreview(csv, "customers", { last_name: "Colonne inexistante", email: "Email" });
  assert.equal(preview.mapping.last_name, undefined);
  assert.equal(preview.rows[0].normalizedData.email, "jean@dupont.fr");
});

test("refuse les montants négatifs et les TVA hors plage dans le catalogue", () => {
  const normalized = normalizeImportRow(
    "catalog",
    { Désignation: "Main d'œuvre", Prix: "-12", Coût: "-2", TVA: "120" },
    { label: "Désignation", unit_price: "Prix", cost_price: "Coût", tax_rate: "TVA" },
  );
  assert.ok(normalized.errors.includes("Le prix de vente ne peut pas être négatif."));
  assert.ok(normalized.errors.includes("Le prix de revient ne peut pas être négatif."));
  assert.ok(normalized.errors.includes("TVA hors plage 0–100 %."));
});

test("fabrique une clé de doublon catalogue stable sur libellé et unité", () => {
  assert.equal(catalogDuplicateKey({ label: "  Peinture Mate ", unit: "M²" }), "peinture mate::m²");
  assert.equal(catalogDuplicateKey({ label: "", unit: "u" }), "");
});
