import test from "node:test";
import assert from "node:assert/strict";
import { normalizeModelPlan } from "../lib/action-planner";
import { hardenPlannedActions, validatePlanDependencies } from "../lib/action-plan-safety";

test("un ordre vocal complexe garde l’ordre, la dépendance client et les niveaux de risque", () => {
  const actions = hardenPlannedActions(normalizeModelPlan({
    actions: [
      {
        intent_type: "create_customer",
        confidence: 0.98,
        payload: { kind: "business", company_name: "Durand Rénovation", emails: ["contact@durand.fr"] },
      },
      {
        intent_type: "prepare_quote",
        confidence: 0.95,
        payload: {
          customer_from_position: 0,
          title: "Rénovation séjour",
          items: [
            { label: "Protection", quantity: 1, unit: "forfait", unit_price: 180, tax_rate: 10 },
            { label: "Peinture murs", quantity: 72, unit: "m²", unit_price: 24.5, tax_rate: 10 },
          ],
        },
      },
      {
        intent_type: "schedule_task",
        confidence: 0.92,
        payload: { customer_hint: "Durand Rénovation", title: "Visite chantier", date: "2026-09-18", time: "08:30", location: "Lyon" },
      },
      {
        intent_type: "update_project_note",
        confidence: 0.9,
        payload: { project_id: "chantier-durand", body: "Prévoir protection renforcée du parquet." },
      },
      {
        intent_type: "prepare_supplier_order",
        confidence: 0.91,
        payload: { project_id: "chantier-durand", supplier_name: "Fournitures Pro", supplier_email: "commande@fournitures.fr", label: "Peinture velours", quantity: 4, unit_price: 89 },
      },
      {
        intent_type: "prepare_email",
        confidence: 0.89,
        payload: { to: "contact@durand.fr", subject: "Votre devis", body: "Bonjour, votre devis est prêt pour relecture." },
      },
    ],
  }, "Crée Durand Rénovation, prépare son devis, planifie la visite, ajoute une note, prépare la commande et un mail"));

  assert.equal(actions.length, 6);
  assert.deepEqual(actions.map((action) => action.intentType), [
    "create_customer",
    "prepare_quote",
    "schedule_task",
    "update_project_note",
    "prepare_supplier_order",
    "prepare_email",
  ]);
  assert.equal(actions[1].customerFromPosition, 0);
  assert.equal(actions[1].status, "ready");
  assert.equal(actions[4].riskLevel, "explicit_confirmation");
  assert.equal(actions[5].riskLevel, "explicit_confirmation");
  assert.ok(actions.every((action) => action.status === "ready"));
});

test("les actions financières et messages incomplets restent bloqués", () => {
  const actions = hardenPlannedActions(normalizeModelPlan({
    actions: [
      { intent_type: "mark_payment", payload: { invoice_number: "FAC-2026-014", amount: 0 } },
      { intent_type: "prepare_email", payload: { to: "pas-un-email", subject: "Relance", body: "Bonjour" } },
      { intent_type: "prepare_supplier_order", payload: { supplier_name: "Point P", supplier_email: "invalide", label: "Placo", quantity: 0, unit_price: 12 } },
    ],
  }, "Enregistre le paiement et prépare les messages"));

  assert.equal(actions[0].status, "needs_input");
  assert.ok(actions[0].missingFields.includes("montant"));
  assert.equal(actions[1].status, "needs_input");
  assert.ok(actions[1].missingFields.includes("destinataire"));
  assert.equal(actions[2].status, "needs_input");
  assert.ok(actions[2].missingFields.includes("email_fournisseur"));
  assert.ok(actions[2].missingFields.includes("quantite"));
});

test("un document sans prestation exploitable reste bloqué", () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({
    actions: [{
      intent_type: "prepare_quote",
      payload: {
        customer_hint: "Martin",
        items: [{ label: "", quantity: 0, unit_price: null, tax_rate: null }],
      },
    }],
  }, "Fais un devis pour Martin"));

  assert.equal(action.status, "needs_input");
  assert.deepEqual(action.payload.items, []);
  assert.deepEqual(action.missingFields, ["prestations"]);
});

test("une dictée naturelle prépare un brouillon même avec une prestation partielle et des champs fantômes du modèle", () => {
  for (const intent_type of ["prepare_quote", "prepare_invoice"] as const) {
    const [action] = hardenPlannedActions(normalizeModelPlan({
      actions: [{
        intent_type,
        missing_fields: ["items[3].label", "prestation_4_quantite", "prestation_4_prix_ht"],
        payload: {
          customer_hint: "Martin",
          items: [
            { label: "Remplacement papier peint plafond chambre 1", quantity: 13, unit: "m²", unit_price: 21, tax_rate: 10 },
            { label: "Remplacement papier peint plafond chambre 2", quantity: 11, unit: "m²", unit_price: 21, tax_rate: 10 },
            { label: "Remplacement papier peint chambre 3", quantity: 15.87, unit: "m²", unit_price: 21, tax_rate: 10 },
            { label: "Couloir, papier peint", quantity: null, unit_price: null, tax_rate: 10 },
          ],
        },
      }],
    }, "Chez Martin, remplace le papier peint des chambres 1, 2 et 3 ; le couloir est à revoir"));

    assert.equal(action.status, "ready");
    assert.deepEqual(action.missingFields, []);
    assert.equal((action.payload.items as unknown[]).length, 4);
    assert.match(action.warnings.join(" "), /Prestation 4 à compléter.*quantité, prix HT/);
  }
});

test("une ligne générique inventée par le modèle ne pollue pas le brouillon", () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({
    actions: [{
      intent_type: "prepare_quote",
      missing_fields: ["items[1].quantity", "items[1].unit_price"],
      payload: { customer_hint: "Martin", items: [
        { label: "Peinture", quantity: 12, unit_price: 30, tax_rate: 10 },
        { label: "Prestation", quantity: null, unit_price: null },
      ] },
    }],
  }, "Peinture 12 m² à 30 euros pour Martin"));

  assert.equal(action.status, "ready");
  assert.deepEqual(action.missingFields, []);
  assert.equal((action.payload.items as unknown[]).length, 1);
});

test("une proposition multi-actions récupère 18,50 m² sur la bonne ligne et garde le prix HT et la TVA", () => {
  const actions = hardenPlannedActions(normalizeModelPlan({ actions: [
    { intent_type: "create_customer", payload: { kind: "individual", last_name: "Vignon", first_name: "Pierre" } },
    { intent_type: "prepare_quote", payload: {
      customer_from_position: 0,
      items: [
        { label: "Remplacement papier peint - Couloir, plafond", quantity: 18, unit: "m²", unit_price: 21, tax_rate: 10, price_type: "ht" },
        { label: "Remplacement papier peint - Chambre 2, plafond", quantity: null, unit: "m²", unit_price: 21, tax_rate: 10, price_type: "ht",
          quantity_evidence: "18,50 m²", price_evidence: "21 euros hors taxes", tax_evidence: "TVA 10 %" },
        { label: "Remplacement papier peint - Chambre 3, plafond", quantity: 11, unit: "m²", unit_price: 21, tax_rate: 10, price_type: "ht" },
      ],
    } },
  ] }, "Client Pierre Vignon. Couloir, plafond à vérifier. Chambre 2, plafond : 18,50 m² à 21 euros hors taxes, TVA 10 %. Chambre 3, plafond : 11 m² à 21 euros hors taxes."));
  const lines = actions[1].payload.items as Array<{ label: string; quantity: number | null; unit_price: number | null; tax_rate: number | null }>;
  assert.deepEqual(lines.map((line) => line.quantity), [null, 18.5, 11]);
  assert.equal(lines[1].unit_price, 21);
  assert.equal(lines[1].tax_rate, 10);
  assert.match(lines[1].label, /Chambre 2, plafond/);
  assert.equal(actions[1].status, "ready");
});

test("le TTC explicite est converti une fois et un TTC sans TVA reste inconnu en HT", () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Dupont",
    items: [
      { label: "Pose cuisine", quantity: 1, unit_price: 120, tax_rate: 20, price_type: "ttc", price_evidence: "120 euros TTC", tax_evidence: "TVA 20 %" },
      { label: "Pose salle de bain", quantity: 1, unit_price: 55, tax_rate: null, price_type: "ttc", price_evidence: "55 euros TTC" },
    ],
  } }] }, "Pose cuisine, 120 euros TTC TVA 20 %. Pose salle de bain, 55 euros TTC."));
  const lines = action.payload.items as Array<{ unit_price: number | null; spoken_price_ttc: number | null; tax_rate: number | null }>;
  assert.equal(lines[0].unit_price, 100);
  assert.equal(lines[0].tax_rate, 20);
  assert.equal(lines[1].unit_price, null);
  assert.equal(lines[1].spoken_price_ttc, 55);
  assert.equal(lines[1].tax_rate, null);
  assert.ok(action.warnings.some((warning) => /TTC de 55/.test(warning)));
});

test("un mélange HT/TTC sans attribution claire ne fabrique pas un prix HT", () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Dupont", items: [{ label: "Fourniture", quantity: 1, unit_price: 21, tax_rate: 10 }],
  } }] }, "Un prix à 21 euros HT et un autre à 30 euros TTC, fourniture à préciser."));
  const [line] = action.payload.items as Array<{ unit_price: number | null; spoken_price_ambiguous: number | null }>;
  assert.equal(line.unit_price, null);
  assert.equal(line.spoken_price_ambiguous, 21);
  assert.ok(action.warnings.some((warning) => /HT\/TTC ambigu/.test(warning)));
});

test("la TVA dictée à 5,5 % convertit le TTC et une TVA non dictée reste absente", () => {
  const [reduced] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Durand", items: [{ label: "Pose", quantity: 1, unit_price: 105.5, tax_rate: 5.5, price_type: "ttc" }],
  } }] }, "Pose à 105,50 euros TTC avec TVA 5,5 % pour Durand."));
  const [reducedLine] = reduced.payload.items as Array<{ unit_price: number; tax_rate: number }>;
  assert.equal(reducedLine.unit_price, 100);
  assert.equal(reducedLine.tax_rate, 5.5);

  const [unspecified] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: "prepare_quote", payload: {
    customer_hint: "Durand", items: [{ label: "Pose", quantity: 1, unit_price: 100, tax_rate: 20, price_type: "ht" }],
  } }] }, "Pose à 100 euros HT pour Durand."));
  const [unspecifiedLine] = unspecified.payload.items as Array<{ tax_rate: number | null }>;
  assert.equal(unspecifiedLine.tax_rate, null);
  assert.ok(unspecified.warnings.some((warning) => /TVA à vérifier/.test(warning)));
});

test("une date ou heure ambiguë/incorrecte est bloquée avant agenda", () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({
    actions: [{
      intent_type: "schedule_task",
      payload: { title: "RDV Dupont", date: "demain", time: "25:90" },
    }],
  }, "Mets un rendez-vous demain soir"));

  assert.equal(action.status, "needs_input");
  assert.ok(action.missingFields.includes("date"));
  assert.ok(action.missingFields.includes("heure"));
});

test("une dépendance client future, négative ou vers le mauvais type est refusée", () => {
  const future = normalizeModelPlan({
    actions: [
      { intent_type: "prepare_quote", payload: { customer_from_position: 1, items: [{ label: "Pose", quantity: 1, unit_price: 100 }] } },
      { intent_type: "create_customer", payload: { kind: "business", company_name: "Test" } },
    ],
  }, "devis puis client");
  assert.throws(() => validatePlanDependencies(future), /dépendance client invalide/i);

  const wrongType = normalizeModelPlan({
    actions: [
      { intent_type: "update_project_note", payload: { project_id: "x", body: "note" } },
      { intent_type: "prepare_quote", payload: { customer_from_position: 0, items: [{ label: "Pose", quantity: 1, unit_price: 100 }] } },
    ],
  }, "note puis devis");
  assert.throws(() => validatePlanDependencies(wrongType), /dépendance client invalide/i);
});

test("le modèle ne peut pas dépasser douze actions ni injecter une intention inconnue", () => {
  const raw = {
    actions: [
      ...Array.from({ length: 12 }, (_, index) => ({
        intent_type: "update_project_note",
        payload: { project_id: `p-${index}`, body: `note ${index}` },
      })),
      { intent_type: "delete_everything", payload: { confirmed: true } },
      { intent_type: "prepare_email", payload: { to: "x@y.fr", subject: "x", body: "x" } },
    ],
  };
  const actions = hardenPlannedActions(normalizeModelPlan(raw, "beaucoup d’actions"));
  assert.equal(actions.length, 12);
  assert.ok(actions.every((action) => action.intentType === "update_project_note"));
});
