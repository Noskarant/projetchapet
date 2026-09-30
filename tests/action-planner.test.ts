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

test("la TVA initiale se propage puis change pour les prestations suivantes", () => {
  const [action] = normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Morel",
    items: [
      { label: "Protection du mobilier", unit: "forfait", quantity: null, unit_price: 180, price_type: "ht", price_evidence: "180 euros HT" },
      { label: "Peinture du séjour", quantity: 18.5, unit: "m²", quantity_evidence: "18,50 m²", unit_price: 32, price_type: "ht" },
      { label: "Peinture de la chambre", quantity: 12, unit: "m²", quantity_evidence: "12 m²", unit_price: 29, price_type: "ht" },
      { label: "Peinture du bureau", quantity: 10, unit: "m²", quantity_evidence: "10 m²", unit_price: 35, price_type: "ht" },
    ],
  } }] }, "TVA 10 % pour le devis. Protection du mobilier un forfait à 180 euros HT. Peinture du séjour 18,50 m² à 32 euros HT. Pour la chambre TVA 20 %, peinture de la chambre 12 m² à 29 euros HT. Peinture du bureau 10 m² à 35 euros HT.");
  const items = action.payload.items as Array<{ tax_rate: number; quantity: number }>;
  assert.deepEqual(items.map((item) => item.tax_rate), [10, 10, 20, 20]);
  assert.equal(items[0].quantity, 1);
});

test("la TVA ponctuelle d'une ligne ne change pas le taux global des suivantes", () => {
  const [action] = normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Morel", items: [
      { label: "Protection", quantity: 1, unit: "forfait", unit_price: 100, price_type: "ht", price_evidence: "100 euros HT" },
      { label: "Fourniture", quantity: 1, unit: "forfait", unit_price: 50, price_type: "ht", tax_rate: 20, tax_evidence: "TVA 20 %" },
      { label: "Pose", quantity: 5, unit: "h", unit_price: 30, price_type: "ht", quantity_evidence: "5 heures" },
    ],
  } }] }, "TVA 10 % pour tout le devis. Protection à 100 euros HT. Fourniture à 50 euros HT, TVA 20 % pour cette prestation. Pose 5 heures à 30 euros HT.");
  const items = action.payload.items as Array<{ tax_rate: number }>;
  assert.deepEqual(items.map((item) => item.tax_rate), [10, 20, 10]);
});

test("le client et le brouillon d'e-mail partagent l'adresse réparée", () => {
  const actions = normalizeModelPlan({ actions: [
    { intent_type: "create_customer", warnings: ["L'adresse e-mail ne contient pas de symbole @."], payload: { kind: "individual", last_name: "Morel", emails: ["julien.morel.exemple.com"] } },
    { intent_type: "prepare_email", missing_fields: ["destinataire"], payload: { to: "julien.morel.exemple.com", subject: "Votre devis", body: "Bonjour" } },
  ] }, "Crée Julien Morel, adresse e-mail julien point morel arobase exemple point com, prépare un e-mail à cette adresse");
  assert.deepEqual(actions[0].payload.emails, ["julien.morel@exemple.com"]);
  assert.equal(actions[1].payload.to, "julien.morel@exemple.com");
  assert.deepEqual(actions[0].warnings, []);
  assert.equal(actions[1].status, "ready");
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

test("une seule dictée relie le client, le devis et le chantier avec son équipe", () => {
  const actions = normalizeModelPlan({ actions: [
    { intent_type: "create_customer", payload: { kind: "individual", last_name: "Dupont" } },
    { intent_type: "prepare_quote", payload: { customer_from_position: 0, items: [{ label: "Peinture", quantity: 18.5, unit_price: 22, price_type: "ht", tax_rate: 10 }] } },
    { intent_type: "create_project", payload: { name: "Salon Dupont", customer_from_position: 0, quote_from_position: 1, collaborator_names: ["Lucas"], address: "12 rue Centrale" } },
  ] }, "Crée le client Dupont, son devis et le chantier Salon Dupont avec Lucas");
  assert.deepEqual(actions.map((action) => action.intentType), ["create_customer", "prepare_quote", "create_project"]);
  assert.equal(actions[2].status, "ready");
  assert.equal(actions[2].customerFromPosition, 0);
  assert.equal(actions[2].quoteFromPosition, 1);
  assert.deepEqual(actions[2].payload.collaborator_names, ["Lucas"]);
});

test("un nom seul suffit pour créer un collaborateur et l'affecter au nouveau chantier", () => {
  const actions = normalizeModelPlan({ actions: [
    { intent_type: "create_collaborator", payload: { name: "Lucas" } },
    { intent_type: "create_project", payload: { name: "Salon Dupont", collaborator_from_positions: [0] } },
  ] }, "Crée Lucas comme collaborateur et affecte-le au chantier Salon Dupont");
  assert.equal(actions[0].status, "ready");
  assert.equal(actions[0].riskLevel, "review");
  assert.equal(actions[0].payload.name, "Lucas");
  assert.deepEqual(actions[1].collaboratorFromPositions, [0]);
});

test("un nom et un prénom, avec rôle facultatif, conservent la fiche dictée", () => {
  const [action] = normalizeModelPlan({ actions: [
    { intent_type: "create_collaborator", payload: { name: "Lucas Martin", role: "peintre" } },
  ] }, "Ajoute Lucas Martin comme collaborateur peintre");
  assert.deepEqual(action.payload, { name: "Lucas Martin", role: "peintre", phone: "" });
  assert.equal(action.status, "ready");
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


test("TVA initiale avec a sans accent et taux zéro se propage sans evidence IA", () => {
  for (const rate of [0, 5.5, 10, 20]) {
    const [action] = normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
      customer_hint: "Philippe", items: [
        { label: "Protection", quantity: 1, unit: "forfait", unit_price: 100, price_type: "ht" },
        { label: "Pose", quantity: 2, unit: "h", unit_price: 50, price_type: "ht" },
      ],
    } }] }, `TVA a ${String(rate).replace(".", ",")} pour cent. Protection à 100 euros HT. Pose 2 heures à 50 euros HT.`);
    assert.deepEqual((action.payload.items as Array<{ tax_rate: number }>).map((line) => line.tax_rate), [rate, rate]);
  }
});
