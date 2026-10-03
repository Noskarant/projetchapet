import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { explicitPrice, explicitQuantity } from '../lib/voice-facts';
import { normalizeModelPlan, plannedActionFromParsed } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';
import { resolveVoicePlanCustomers } from '../lib/voice-plan-customers';
import { orderVoicePlan } from '../lib/voice-plan-order';
import { voiceAgendaEntry } from '../lib/voice-action-history';
import { normalizeMobileWorkspace } from '../lib/mobile-workspace-storage';
import { EMPTY_MOBILE_WORKSPACE } from '../lib/mobile-fresh-start';
import { fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand, applyMobileVoiceCommand } from '../lib/mobile-voice-command';
import { seedMobileWorkspace, calculateTotals, type LineItem } from '../lib/mobile-prototype';
import { mergeDocumentChanges } from '../lib/mobile-desktop-sync';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';

const transcript = 'Tu vas faire une facture pour Henri Perbet qui habite 54 avenue de Montesquieu à Vosges, dans la Loire. Rénovation de votre portail extérieur, préparation mise en peinture, anti-rouille de finition, une unité, 1 700 euros HT, TVA 10 %.';
const invoice = { intent_type: 'prepare_invoice', payload: { customer_hint: 'Henri Perbet', items: [
  'Rénovation de votre portail extérieur', 'Préparation mise en peinture', 'Anti-rouille de finition',
].map(label => ({ label, quantity: 1, unit: 'unité', unit_price: 700, price_evidence: '700 euros HT', tax_rate: 10 })) } };
const customer = { intent_type: 'create_customer', payload: { kind: 'individual', last_name: 'Perbet', first_name: 'Henri', addresses: [{ line1: '54 avenue de Montesquieu', city: 'Vosges', postal_code: '' }] } };
const backend = (customers: unknown[]) => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: customers, error: null }) }) }) }) }) as unknown as SupabaseClient;
const lines = (items: Array<Record<string, unknown>>): LineItem[] => items.map((item, i) => ({ id: String(i), label: String(item.label), description: String(item.description || ''), quantity: item.quantity as number | null, unit: item.unit as string | null, unitPrice: item.unit_price as number | null, taxRate: item.tax_rate as number | null }));

test('montants français : espaces des milliers, décimales et une unité conservés', () => {
  for (const separator of [' ', '\u00a0', '\u202f']) assert.equal(explicitPrice(`1${separator}700 euros HT`), 1700);
  assert.equal(explicitPrice('12 350,75 euros TTC'), 12350.75);
  assert.equal(explicitPrice('mille sept cents euros HT'), 1700);
  assert.equal(explicitQuantity('une unité'), 1);
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  const command = fallbackMobileVoiceCommand('Sur la ligne peinture séjour, passe le prix à 1 800 euros HT.', { entity: 'quote', id: quote.id, data: quote }, workspace);
  assert.equal(command.line_operations?.[0]?.prix_unitaire_ht, 1800);
});

test('dictée PERBET réelle : une intervention complète à 1700 HT, TVA170, TTC1870', () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({ actions: [invoice] }, transcript));
  const items = lines(action.payload.items as Array<Record<string, unknown>>);
  assert.equal(items.length, 1);
  assert.match(items[0].label, /portail.*peinture.*rouille/iu);
  assert.equal(items[0].unitPrice, 1700);
  assert.deepEqual(calculateTotals(items), { subtotal: 1700, taxTotal: 170, total: 1870 });
  const legacy = plannedActionFromParsed('invoice', invoice.payload, transcript);
  assert.equal(lines(legacy.payload.items as Array<Record<string, unknown>>)[0].unitPrice, 1700);
});

test('un seul poste à 1700 ne conserve pas la troncature du modèle à700', () => {
  const [action] = normalizeModelPlan({ actions: [{ ...invoice, payload: { ...invoice.payload, items: [invoice.payload.items[0]] } }] }, transcript);
  assert.equal((action.payload.items as Array<Record<string, unknown>>)[0].unit_price, 1700);
});

test('plusieurs prestations ou tarifs identiques par poste restent des postes distincts', () => {
  for (const text of ['Préparation une unité à 700 euros HT. Peinture une unité à 700 euros HT. Finition une unité à 700 euros HT. TVA10%.', 'Trois postes, chacun une unité au prix de 700 euros HT, TVA10%.']) {
    const [action] = normalizeModelPlan({ actions: [invoice] }, text);
    assert.equal((action.payload.items as unknown[]).length, 3);
  }
  const [incomplete] = normalizeModelPlan({ actions: [{ ...invoice, payload: { ...invoice.payload, items: [invoice.payload.items[0], { label: 'Fourniture à compléter', quantity: null, unit_price: null }] } }] }, 'Portail extérieur un forfait à 1700 euros HT, TVA10%. Fourniture à compléter.');
  assert.equal((incomplete.payload.items as unknown[]).length, 2);
});

test('une unité tarifée TTC se regroupe avec une seule conversion et sans inventer sa TVA', () => {
  const [known] = normalizeModelPlan({ actions: [invoice] }, transcript.replace('1 700 euros HT', '1 870 euros TTC'));
  assert.equal((known.payload.items as Array<Record<string, unknown>>)[0].unit_price, 1700);
  const [unknown] = normalizeModelPlan({ actions: [invoice] }, transcript.replace('HT, TVA 10 %', 'TTC'));
  assert.equal((unknown.payload.items as Array<Record<string, unknown>>)[0].unit_price, null);
});

test('PERBET : prénom nom retrouve la fiche nom prénom et conserve son adresse sans doublon', async () => {
  const actions = normalizeModelPlan({ actions: [invoice, customer] }, transcript);
  await resolveVoicePlanCustomers(actions, 'org', backend([]));
  const ordered = hardenPlannedActions(orderVoicePlan(actions));
  assert.deepEqual(ordered.map(action => action.intentType), ['create_customer', 'prepare_invoice']);
  assert.equal(ordered[1].customerFromPosition, 0);
  assert.deepEqual((ordered[0].payload.addresses as Array<Record<string, unknown>>)[0], { label: 'Principale', line1: '54 avenue de Montesquieu', line2: '', city: 'Vosges', postal_code: '', country: 'France' });
  const existing = normalizeModelPlan({ actions: [invoice] }, transcript);
  await resolveVoicePlanCustomers(existing, 'org', backend([{ id: 'perbet', kind: 'individual', first_name: 'Henri', last_name: 'Perbet', civility: 'M.' }]));
  assert.equal(existing.length, 1);
  assert.equal(existing[0].payload.customer_id, 'perbet');
});

test('les homonymes restent ambigus et ne sont pas fusionnés', async () => {
  const actions = normalizeModelPlan({ actions: [invoice] }, transcript);
  await resolveVoicePlanCustomers(actions, 'org', backend(['1', '2'].map(id => ({ id, kind: 'individual', first_name: 'Henri', last_name: 'Perbet' }))));
  assert.equal(actions[0].status, 'needs_input');
  assert.ok(actions[0].missingFields.includes('client_ambigu'));
});

test('Bazin sans heure : création directe prête, événement à la journée après rechargement', () => {
  const [action] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: 'schedule_task', missing_fields: ['heure', 'time'], payload: { title: 'Chantier Monsieur Bazin', customer_hint: 'Monsieur Bazin', date: '2026-10-05', time: '' } }] }, 'Je me rappelle le 5 octobre où il faudra aller faire le chantier de Monsieur Bazin.'));
  assert.equal(action.status, 'ready');
  assert.deepEqual(action.missingFields, []);
  const entry = voiceAgendaEntry({ id: 'bazin', payload: action.payload, created_at: '2026-10-03' }, []);
  assert.ok(entry);
  const restored = normalizeMobileWorkspace(JSON.parse(JSON.stringify({ ...EMPTY_MOBILE_WORKSPACE, agenda: [entry] })), EMPTY_MOBILE_WORKSPACE);
  assert.equal(restored.agenda[0].time, '');
  assert.equal(restored.agenda[0].date, '2026-10-05');
});

test('agenda : une vraie heure invalide ou une date absente reste à compléter', () => {
  for (const payload of [{ title: 'Visite', date: '', time: '' }, { title: 'Visite', date: '2026-10-05', time: '25:80' }]) {
    const [action] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: 'schedule_task', payload }] }, 'Visite'));
    assert.equal(action.status, 'needs_input');
  }
});

test('enlever la remise : le modèle ne peut ignorer le zéro ni supprimer une prestation', () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  quote.notes = 'Remise globale de 2 % sur ce chantier. Franchise de 150 euros TTC.';
  const fallback = fallbackMobileVoiceCommand("Enlève la remise de 2 %", { entity: 'quote', id: quote.id, data: quote }, workspace);
  assert.equal(fallback.changes?.discount_percent, 0);
  assert.deepEqual(fallback.line_operations, []);
  const command = sanitizeMobileVoiceCommand({ changes: {}, line_operations: [{ action: 'delete', match: 'la remise de 2 %' }] }, fallback);
  assert.equal(command.changes?.discount_percent, 0);
  assert.deepEqual(command.line_operations, []);
  const updated = applyMobileVoiceCommand(workspace, command).quotes[0];
  assert.deepEqual(updated.items, quote.items);
  assert.doesNotMatch(updated.notes, /Remise/iu);
  assert.match(updated.notes, /Franchise/iu);
});

test('une correction de notes ou de nom ne remet pas l’ancienne TVA depuis un téléphone resté ouvert', () => {
  const baseline = seedMobileWorkspace().quotes[0];
  const server = { ...baseline, items: baseline.items.map(item => ({ ...item, taxRate: 10 })) };
  const notes = mergeDocumentChanges(baseline, { ...baseline, notes: 'Franchise conservée' }, server);
  assert.deepEqual(notes.items, server.items);
  assert.equal(notes.notes, 'Franchise conservée');
  const renamed = mergeDocumentChanges(baseline, { ...baseline, customerName: 'Orthographe corrigée' }, server);
  assert.deepEqual(renamed.items, server.items);
  const edited = { ...baseline, items: baseline.items.map(item => ({ ...item, taxRate: 20 })) };
  assert.deepEqual(mergeDocumentChanges(baseline, edited, server).items, edited.items);
});

test('changer un prix préserve les TVA corrigées et les nouvelles prestations du serveur', () => {
  const baseline = seedMobileWorkspace().quotes[0];
  const server = { ...baseline, items: [...baseline.items.map(item => ({ ...item, id: `server-${item.id}`, taxRate: 10 })), { ...baseline.items[0], id: 'cloud-added', label: 'Poste ajouté au bureau', taxRate: 10 }] };
  const local = { ...baseline, items: baseline.items.map((item, index) => index === 0 ? { ...item, unitPrice: 42 } : item) };
  const result = mergeDocumentChanges(baseline, local, server);
  assert.equal(result.items[0].unitPrice, 42);
  assert.ok(result.items.every(item => item.taxRate === 10));
  assert.equal(result.items.at(-1)?.label, 'Poste ajouté au bureau');
  const removed = mergeDocumentChanges(baseline, { ...local, items: local.items.slice(1) }, server);
  assert.ok(!removed.items.some(item => item.label === baseline.items[0].label));
  assert.equal(removed.items.at(-1)?.label, 'Poste ajouté au bureau');
});

test('facture PDF PERBET : une seule prestation, adresse dictée, HT1700 TVA170 TTC1870', async () => {
  const [action] = normalizeModelPlan({ actions: [invoice] }, transcript);
  const items = lines(action.payload.items as Array<Record<string, unknown>>);
  const seed = seedMobileWorkspace();
  const customer = { ...seed.customers[0], kind: 'Particulier' as const, companyName: '', firstName: 'Henri', lastName: 'Perbet', address: '54 avenue de Montesquieu', postalCode: '', city: 'Vosges' };
  const document = { ...seed.invoices[0], customerId: customer.id, customerName: 'Henri Perbet', items, notes: '', ...calculateTotals(items) };
  const blob = await buildBusinessDocumentPdf({ document, customer, company: { displayName: 'Entreprise Test', legalName: 'Entreprise Test', siret: '', vat: '' } });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const text = content.items.filter(item => 'str' in item).map(item => item.str).join(' ');
    assert.match(text, /54 avenue de Montesquieu/iu);
    assert.match(text, /1 700,00 €/u);
    assert.match(text, /170,00 €/u);
    assert.match(text, /1 870,00 €/u);
    assert.ok(!content.items.some(item => 'str' in item && item.str.trim() === '700,00 €'));
  } finally { await task.destroy(); }
});
