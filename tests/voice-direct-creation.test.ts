import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelPlan, plannedActionFromParsed } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';
import { orderVoicePlan } from '../lib/voice-plan-order';
import { documentDeductible, deductibleNotes } from '../lib/document-deductible';
import { calculateTotals, type LineItem } from '../lib/mobile-prototype';
import { recalculatePercentageLines } from '../lib/percentage-adjustments';
import { canCreateDirectly } from '../lib/voice-direct-creation';
import { resolveVoicePlanCustomers } from '../lib/voice-plan-customers';
import type { SupabaseClient } from '@supabase/supabase-js';

export const philippeTranscript = 'Crée le chantier rénovation des cuisines pour le Crous de Lyon, 12 rue Camelinat à Saint-Étienne. Cuisine plafond préparation mise en peinture mat deux couches, 12 mètres carrés à 22,40 euros HT, TVA 10 %. Murs remplacement de papier peint, 12 mètres carrés à 12 euros, toujours TVA 10 %, 5 rouleaux de papier peint à 10 euros. On rajoutera une RSE de 1 % sur le montant total des travaux et on déduira une franchise de 150 euros TTC.';
export const philippeModel = { actions: [
  { intent_type: 'create_project', payload: { name: 'Rénovation des cuisines', customer_hint: 'Crous de Lyon', quote_from_position: 1, address: '12 rue Camelinat, Saint-Étienne' } },
  { intent_type: 'prepare_quote', warnings: ['Ligne mise en peinture mat deux couches : aucun prix ni quantité fournis.'], payload: { customer_hint: 'Crous de Lyon', title: 'Rénovation cuisines', items: [
    { label: 'Cuisine plafond préparation peinture mat deux couches', quantity: 12, quantity_evidence: '12 mètres carrés', unit: 'm²', unit_price: 22.4, price_evidence: '22,40 euros HT', tax_rate: 10, tax_evidence: 'TVA 10 %' },
    { label: 'Murs remplacement papier peint', quantity: 12, unit: 'm²', unit_price: 12, price_evidence: '12 euros', tax_rate: 10, tax_evidence: 'toujours TVA 10 %' },
    { label: 'Rouleaux de papier peint', quantity: 5, quantity_evidence: '5 rouleaux', unit: 'rouleaux', unit_price: 10, price_evidence: '10 euros', tax_rate: 10, tax_evidence: 'toujours TVA 10 %' },
  ] } },
] };
const mobileLines = (items: Array<Record<string, unknown>>): LineItem[] => items.map((item, i) => ({ id: String(i), label: String(item.label), description: String(item.description || ''), quantity: item.quantity as number | null, unit: item.unit as string | null, unitPrice: item.unit_price as number | null, taxRate: item.tax_rate as number | null }));

test('CROUS : prix HT conservés malgré la franchise TTC, RSE sur les trois postes et montants exacts', () => {
  const actions = hardenPlannedActions(orderVoicePlan(normalizeModelPlan(philippeModel, philippeTranscript)));
  assert.deepEqual(actions.map(a => a.intentType), ['prepare_quote', 'create_project']);
  assert.equal(actions[1].quoteFromPosition, 0);
  const quote = actions[0];
  assert.equal(quote.status, 'ready');
  assert.deepEqual(quote.warnings, []);
  const lines = mobileLines(quote.payload.items as Array<Record<string, unknown>>);
  assert.deepEqual(lines.map(line => line.unitPrice), [22.4, 12, 10, 4.63]);
  assert.deepEqual(lines.map(line => line.taxRate), [10, 10, 10, 10]);
  const totals = calculateTotals(lines);
  assert.deepEqual(totals, { subtotal: 467.43, taxTotal: 46.74, total: 514.17 });
  assert.deepEqual(documentDeductible(String(quote.payload.notes), totals.total), { amount: 150, afterDeductible: 364.17 });
  const changed = recalculatePercentageLines(lines.map((line, i) => i === 1 ? { ...line, quantity: 20 } : line));
  assert.equal(changed[3].unitPrice, 5.59);
});

test('les liaisons futures client, devis, collaborateurs sont triées et remappées sans perdre les autres actions', () => {
  const actions = orderVoicePlan(normalizeModelPlan({ actions: [
    { intent_type: 'create_project', payload: { name: 'Cuisine', customer_from_position: 3, quote_from_position: 2, collaborator_from_positions: [1] } },
    { intent_type: 'create_collaborator', payload: { name: 'Lucas' } },
    { intent_type: 'prepare_quote', payload: { customer_from_position: 3, items: [{ label: 'Peinture', quantity: 12, unit_price: 22.4 }] } },
    { intent_type: 'create_customer', payload: { kind: 'business', company_name: 'CROUS' } },
    { intent_type: 'schedule_task', payload: { title: 'Visite', date: '2026-10-06', time: '09:00' } },
  ] }, 'Crée le client, le chantier, Lucas et le devis puis la visite'));
  assert.deepEqual(actions.map(a => a.intentType), ['create_customer', 'prepare_quote', 'create_collaborator', 'create_project', 'schedule_task']);
  assert.equal(actions[1].customerFromPosition, 0);
  assert.equal(actions[3].quoteFromPosition, 1);
  assert.deepEqual(actions[3].collaboratorFromPositions, [2]);
  assert.doesNotThrow(() => hardenPlannedActions(actions));
});

test('une ligne sans prix reste modifiable, la RSE reste inconnue tant que sa base manque', () => {
  const [quote] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint: 'CROUS', items: [{ label: 'Peinture', quantity: 12, unit_price: null, tax_rate: 10 }] } }] }, 'TVA 10 %, peinture 12 mètres carrés, RSE 1 %'));
  assert.equal(quote.status, 'ready');
  const lines = mobileLines(quote.payload.items as Array<Record<string, unknown>>);
  assert.equal(lines[0].unitPrice, null);
  assert.equal(lines[1].unitPrice, null);
});

test('la franchise persiste dans les notes sans doublon et ne transforme pas une vraie ambiguïté HT/TTC', () => {
  const once = deductibleNotes('Travaux cuisine', philippeTranscript);
  assert.equal(deductibleNotes(once, philippeTranscript), once);
  const [quote] = normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint: 'CROUS', items: [{ label: 'Fourniture', quantity: 1, unit_price: 21 }] } }] }, 'Un prix à 21 euros HT et un autre à 30 euros TTC, fourniture à préciser. Franchise de 150 euros TTC.');
  assert.equal((quote.payload.items as Array<Record<string, unknown>>)[0].unit_price, null);
});

test('création directe réservée aux fiches et brouillons, aucun envoi ni paiement implicite', () => {
  const proposal = (intent_type: string, payload = {}) => ({ intent_type, payload, status: 'ready', missing_fields: [] });
  for (const intent of ['create_customer', 'create_supplier', 'create_collaborator', 'create_project', 'prepare_quote', 'prepare_invoice', 'prepare_email', 'schedule_task']) assert.equal(canCreateDirectly(proposal(intent)), true);
  assert.equal(canCreateDirectly(proposal('mark_payment')), false);
  assert.equal(canCreateDirectly(proposal('prepare_supplier_order', { send_requested: true })), false);
});

test('le client nommé absent est créé avant devis et chantier, puis réutilisé quand il existe', async () => {
  const client = (customers: unknown[]) => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: customers, error: null }) }) }) }) }) as unknown as SupabaseClient;
  const actions = normalizeModelPlan(philippeModel, philippeTranscript);
  await resolveVoicePlanCustomers(actions, 'org', client([]));
  const ordered = hardenPlannedActions(orderVoicePlan(actions));
  assert.deepEqual(ordered.map(a => a.intentType), ['create_customer', 'prepare_quote', 'create_project']);
  assert.equal(ordered[1].customerFromPosition, 0);
  assert.equal(ordered[2].customerFromPosition, 0);
  assert.equal(ordered[2].quoteFromPosition, 1);
  const existing = normalizeModelPlan(philippeModel, philippeTranscript);
  await resolveVoicePlanCustomers(existing, 'org', client([{ id: 'customer-1', kind: 'business', company_name: 'Crous de Lyon' }]));
  assert.equal(existing.length, 2);
  assert.equal(existing[0].payload.customer_id, 'customer-1');
  assert.equal(existing[1].payload.customer_id, 'customer-1');
});


test('un chantier indépendant ne récupère pas un devis dont le client diffère', () => {
  const actions = orderVoicePlan(normalizeModelPlan({actions:[
    {intent_type:'create_project',payload:{name:'Atelier'}},
    {intent_type:'prepare_quote',payload:{customer_id:'autre-client',items:[{label:'Peinture',quantity:1,unit_price:10}]}},
  ]}, 'Crée le chantier Atelier. Fais aussi le devis pour un autre client.'));
  assert.equal(actions[0].quoteFromPosition, undefined);
});


test('la sortie réelle du modèle avec nombres en lettres conserve prix, RSE, TVA et franchise', () => {
  const transcript = 'TVA dix pour cent pour tout le devis. Peinture plafond, douze mètres carrés à vingt-deux euros quarante hors taxes. Papier peint murs, douze mètres carrés à douze euros hors taxes. Cinq rouleaux à dix euros hors taxes. RSE un pour cent du montant total des travaux. Franchise de cent cinquante euros TTC.';
  const action = plannedActionFromParsed('quote', {customer_hint:'Client Fictif Test',items:[
    {label:'Peinture plafond',quantity:12,unit:'m²',unit_price:22.4,tax_rate:10,price_type:'ht'},
    {label:'Papier peint murs',quantity:12,unit:'m²',unit_price:12,tax_rate:10,price_type:'ht'},
    {label:'Rouleaux',quantity:5,unit:null,unit_price:10,tax_rate:10,price_type:'ht'},
  ]},transcript);
  const lines=mobileLines(action.payload.items as Array<Record<string,unknown>>);
  assert.deepEqual(lines.map(line=>line.unitPrice),[22.4,12,10,4.63]);
  assert.deepEqual(lines.map(line=>line.taxRate),[10,10,10,10]);
  assert.equal(lines[2].unit,'rouleaux');
  assert.deepEqual(documentDeductible(String(action.payload.notes),calculateTotals(lines).total),{amount:150,afterDeductible:364.17});
});


test('RSE en lettres remplace le poste forfaitaire du modèle sans compter deux fois et la remise reste distincte', () => {
  const [action] = normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Client Test',items:[
    {label:'Peinture',quantity:1,unit_price:1000,tax_rate:10},
    {label:'Majoration RSE 1 %',quantity:1,unit_price:2.69,tax_rate:10},
  ]}}]}, 'TVA 10 %, peinture un forfait à 1000 euros HT. RSE un pour cent, remise de quatre pour cent. Franchise de trois cent vingt euros TTC.');
  const lines=mobileLines(action.payload.items as Array<Record<string,unknown>>);
  assert.equal(lines.length,2);
  assert.equal(lines[1].unitPrice,10);
  assert.equal(action.payload.discount_percent,4);
  assert.equal(documentDeductible(String(action.payload.notes),1111).amount,320);
});
