import assert from "node:assert/strict";
import test from "node:test";
import { matchMobileCustomer } from "../lib/mobile-customer-match";
import type { MobileCustomer } from "../lib/mobile-prototype";

const customer = (id: string, companyName: string): MobileCustomer => ({
  id,
  kind: "Professionnel",
  companyName,
  civility: "",
  lastName: "",
  firstName: "",
  emails: [],
  phones: [],
  address: "",
  postalCode: "",
  city: "",
  siret: "",
  vat: "",
  notes: "",
});

const person = (id: string, civility: string, lastName: string, firstName = ""): MobileCustomer => ({
  id,
  kind: "Particulier",
  companyName: "",
  civility,
  lastName,
  firstName,
  emails: [],
  phones: [],
  address: "",
  postalCode: "",
  city: "",
  siret: "",
  vat: "",
  notes: "",
});

const customers = [
  customer("1", "SCI Bellevue"),
  customer("2", "Bellevue Peinture"),
  customer("3", "Société Martin"),
];

test("refuse une dictée sans client", () => {
  assert.equal(matchMobileCustomer(customers, "").status, "missing");
});

test("reconnaît un client exact malgré les accents et la casse", () => {
  const result = matchMobileCustomer(customers, "société MARTIN");
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.id, "3");
});

test("reconnaît Monsieur comme équivalent de M. avec un nom composé", () => {
  const result = matchMobileCustomer(
    [person("dupont", "M.", "Dupont-Jacques")],
    "Monsieur dupont-jacques",
  );
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.id, "dupont");
});

test("reconnaît Madame comme équivalent de Mme même sans le prénom", () => {
  const result = matchMobileCustomer(
    [person("soulier", "Mme", "SOULIER", "Françoise")],
    "Madame Soulier",
  );
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.id, "soulier");
});

test("reconnaît Mademoiselle comme équivalent de Mlle", () => {
  const result = matchMobileCustomer(
    [person("petit", "Mlle", "Petit", "Lucie")],
    "Mademoiselle Petit",
  );
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.id, "petit");
});

test("reconnaît un particulier lorsque la civilité est omise", () => {
  const result = matchMobileCustomer(
    [person("dupont", "M.", "Dupont-Jacques")],
    "Dupont Jacques",
  );
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.id, "dupont");
});

test("utilise la civilité pour distinguer deux clients homonymes", () => {
  const homonyms = [
    person("mr-dupont", "M.", "Dupont"),
    person("mme-dupont", "Mme", "Dupont"),
  ];
  const monsieur = matchMobileCustomer(homonyms, "Monsieur Dupont");
  const madame = matchMobileCustomer(homonyms, "Madame Dupont");
  const withoutTitle = matchMobileCustomer(homonyms, "Dupont");

  assert.equal(monsieur.status, "matched");
  assert.equal(monsieur.matches[0]?.id, "mr-dupont");
  assert.equal(madame.status, "matched");
  assert.equal(madame.matches[0]?.id, "mme-dupont");
  assert.equal(withoutTitle.status, "ambiguous");
});

test("refuse une correspondance ambiguë", () => {
  const result = matchMobileCustomer(customers, "Bellevue");
  assert.equal(result.status, "ambiguous");
  assert.equal(result.matches.length, 2);
});

test("refuse un client absent au lieu de prendre le premier", () => {
  assert.equal(matchMobileCustomer(customers, "Dupont").status, "not_found");
});
