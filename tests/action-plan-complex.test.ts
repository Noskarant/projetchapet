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

test("un devis avec une ligne inexploitable ne peut plus passer en ready", () => {
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
  assert.ok(action.missingFields.includes("prestation_1_libelle"));
  assert.ok(action.missingFields.includes("prestation_1_quantite"));
  assert.ok(action.missingFields.includes("prestation_1_prix_ht"));
  assert.ok(action.warnings.some((warning) => /TVA/.test(warning)));
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
