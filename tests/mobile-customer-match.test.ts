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

test("refuse une correspondance ambiguë", () => {
  const result = matchMobileCustomer(customers, "Bellevue");
  assert.equal(result.status, "ambiguous");
  assert.equal(result.matches.length, 2);
});

test("refuse un client absent au lieu de prendre le premier", () => {
  assert.equal(matchMobileCustomer(customers, "Dupont").status, "not_found");
});
