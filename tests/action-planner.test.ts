import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackCommandPlan,
  normalizeModelPlan,
  plannedActionFromParsed,
} from "../lib/action-planner";

test("un client dicté devient une proposition prête et normalisée", () => {
  const action = plannedActionFromParsed("customer", {
    kind: "business",
    company_name: "Martin Peinture",
    siret: "892 445 112 00018",
    email1: "contact@martin.fr",
    phone1: "06 12 34 56 78",
    line1: "12 rue de la République",
    postal_code: "42000",
    city: "Saint-Étienne",
  }, "Crée Martin Peinture");

  assert.equal(action.intentType, "create_customer");
  assert.equal(action.status, "ready");
  assert.equal(action.riskLevel, "review");
  assert.equal(action.payload.company_name, "Martin Peinture");
  assert.deepEqual(action.payload.emails, ["contact@martin.fr"]);
  assert.deepEqual(action.payload.phones, ["06 12 34 56 78"]);
});

test("le prénom et le nom épelés prévalent sur l'orthographe devinée par le modèle", () => {
  const action = plannedActionFromParsed("customer", {
    kind: "individual", first_name: "Piere", last_name: "Vigon",
  }, "Prénom P I E R R E, nom V I G N O N");
  assert.equal(action.payload.first_name, "Pierre");
  assert.equal(action.payload.last_name, "Vignon");
});

test("une facture reste une action sensible même quand le modèle ne le demande pas", () => {
  const action = plannedActionFromParsed("invoice", {
    customer_hint: "Dupont",
    items: [{ label: "Peinture", quantity: 10, unit: "m²", unit_price: 30, tax_rate: 10 }],
  }, "Fais une facture pour Dupont");

  assert.equal(action.intentType, "prepare_invoice");
  assert.equal(action.riskLevel, "explicit_confirmation");
  assert.equal(action.status, "ready");
});

test("TVA 10 % annoncée au début reste appliquée aux lignes suivantes", () => {
  const [action] = normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Philippe",
    items: [
      { label: "Peinture salon", quantity: 18.5, unit: "m²", unit_price: 21, price_type: "ht" },
      { label: "Pose de 15 rouleau", quantity: 15, unit: "rouleau", unit_price: 12, price_type: "ht" },
    ],
  } }] }, "TVA 10 % pour tout le devis, 18,50 m² de peinture salon à 21 euros HT, pose de 15 rouleaux à 12 euros HT pour Philippe");
  const items = action.payload.items as Array<{ tax_rate: number; quantity: number; label: string }>;
  assert.deepEqual(items.map((item) => item.tax_rate), [10, 10]);
  assert.equal(items[0].quantity, 18.5);
  assert.equal(items[1].label, "Pose de 15 rouleaux");
});

test("le plan multi-actions conserve la dépendance nouveau client vers devis", () => {
  const actions = normalizeModelPlan({
    actions: [
      {
        intent_type: "create_customer",
        confidence: 0.96,
        payload: { kind: "business", company_name: "Martin Peinture" },
      },
      {
        intent_type: "prepare_quote",
        confidence: 0.91,
        payload: {
          customer_from_position: 0,
          title: "Peinture appartement",
          items: [{ label: "Peinture murs", quantity: 80, unit: "m²", unit_price: 22, tax_rate: 10 }],
        },
      },
    ],
  }, "Crée Martin Peinture puis fais un devis");

  assert.equal(actions.length, 2);
  assert.equal(actions[0].intentType, "create_customer");
  assert.equal(actions[1].intentType, "prepare_quote");
  assert.equal(actions[1].customerFromPosition, 0);
  assert.equal(actions[1].status, "ready");
});

test("les informations obligatoires absentes bloquent l’exécution sans invention", () => {
  const actions = normalizeModelPlan({
    actions: [{
      intent_type: "mark_payment",
      payload: { invoice_number: "FAC-2026-001", amount: null },
      confidence: 0.8,
    }],
  }, "Enregistre le paiement de la facture");

  assert.equal(actions[0].status, "needs_input");
  assert.deepEqual(actions[0].missingFields, ["montant"]);
  assert.equal(actions[0].riskLevel, "explicit_confirmation");
});

test("sans modèle multi-actions le fallback garde la demande mais n’invente rien", () => {
  const [action] = fallbackCommandPlan("Fais un devis pour le chantier");
  assert.equal(action.intentType, "prepare_quote");
  assert.equal(action.status, "needs_input");
  assert.ok(action.missingFields.includes("client"));
  assert.ok(action.missingFields.includes("prestations"));
});
