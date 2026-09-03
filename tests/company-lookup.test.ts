import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGovernmentCompanyResult, selectGovernmentCompany } from "../lib/company-lookup";

test("normalise une entreprise de l'API gouvernementale", () => {
  const company = normalizeGovernmentCompanyResult({
    nom_raison_sociale: "ATELIER MARTIN",
    siren: "123456789",
    tva: ["FR00123456789"],
    siege: {
      siret: "12345678900012",
      adresse: "12 RUE DE LYON",
      code_postal: "69002",
      libelle_commune: "Lyon",
    },
  });
  assert.deepEqual(company, {
    companyName: "ATELIER MARTIN",
    siret: "12345678900012",
    siren: "123456789",
    vatNumber: "FR00123456789",
    address: "12 RUE DE LYON",
    postalCode: "69002",
    city: "Lyon",
  });
});

test("sélectionne uniquement le SIRET exact", () => {
  const results = [
    { nom_raison_sociale: "A", siren: "123456789", siege: { siret: "12345678900011" } },
    { nom_raison_sociale: "B", siren: "987654321", siege: { siret: "98765432100022" } },
  ];
  assert.equal(selectGovernmentCompany(results, "98765432100022")?.companyName, "B");
  assert.equal(selectGovernmentCompany(results, "00000000000000"), null);
});
