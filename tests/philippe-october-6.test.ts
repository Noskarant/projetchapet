import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelPlan } from '../lib/action-planner';
import { calculateTotals, convertQuoteToInvoice, normalizeQuote, seedMobileWorkspace, sortedCustomers, type LineItem } from '../lib/mobile-prototype';
import { applyMobileVoiceCommand, fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from '../lib/mobile-voice-command';
import { applySpokenPercentageLines } from '../lib/percentage-adjustments';
import { insuranceDocumentNotes } from '../lib/document-insurance';
import { normalizeVoiceTranscript } from '../lib/voice-facts';
import { scopedVoiceUnitPrices } from '../lib/voice-document-lines';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { customerSourceRequest, quoteSourceRequest } from '../lib/quote-sources';
import { readQuoteSources } from '../lib/quote-source-reader';

const transcript = 'TVA 10 %. Peinture des plafonds 12 m² à 22,30 euros HT. Peinture des murs 10 m² à 21 euros HT. Fourniture de cinq rouleaux de papier peint à 29 euros hors-taxes chaque rouleau. RSE environnementale de 1 % du total HT des travaux. Franchise à déduire de 125 euros TTC.';
const source = [
  { label: 'Peinture des plafonds', quantity: 12, unit: 'm²', unit_price: 22.3 },
  { label: 'Peinture des murs', quantity: 10, unit: 'm²', unit_price: 21 },
  { label: 'Cinq rouleaux de papier peint', quantity: 5, unit: 'rouleau', unit_price: null },
  { label: 'RSE (1 %)', quantity: 1, unit: 'forfait', unit_price: null },
];
function plan(intent = 'prepare_quote', text = transcript) {
  const action = normalizeModelPlan({ actions: [{ intent_type: intent, payload: { customer_hint: 'PIN', items: source } }] }, text)[0];
  return (action.payload.items as Array<Record<string, unknown>>).map((line, index): LineItem => ({ id: `line-${index}`, label: String(line.label), description: String(line.description || ''), quantity: line.quantity as number | null, unit: line.unit as string | null, unitPrice: line.unit_price as number | null, taxRate: line.tax_rate as number | null }));
}

test('devis et facture : 5 × 29 HT, RSE calculée sur 622,60 HT puis franchise TTC, sans mélange des prix', async () => {
  for (const intent of ['prepare_quote', 'prepare_invoice']) {
    const items = plan(intent);
    assert.deepEqual(items.slice(0, 3).map(line => line.unitPrice), [22.3, 21, 29]);
    assert.equal(items[2].quantity! * items[2].unitPrice!, 145);
    assert.match(items[3].label, /RSE environnementale/);
    assert.equal(items[3].unitPrice, 6.23); assert.equal(items[4].unitPrice, -113.64);
    assert.deepEqual(calculateTotals(items), { subtotal: 515.19, taxTotal: 51.52, total: 566.71 });
    assert.deepEqual(applySpokenPercentageLines(items, transcript), items);
    const workspace = seedMobileWorkspace();
    const quote = normalizeQuote({ ...workspace.quotes[0], items });
    const invoice = convertQuoteToInvoice(workspace, quote, 0).invoice;
    assert.deepEqual(invoice.items.map(({ id, ...line }) => line), quote.items.map(({ id, ...line }) => line)); assert.equal(invoice.total, 566.71);
    const changed = normalizeQuote({ ...quote, items: quote.items.map(line => line.id === items[2].id ? { ...line, quantity: 6 } : line) });
    assert.equal(changed.items[3].unitPrice, 6.52); assert.equal(changed.items[4].unitPrice, -113.64);
    if (intent === 'prepare_quote') {
      const notes = insuranceDocumentNotes('Numéro de dossier : F260361820', { case_reference: 'F263161', mission_reference: 'R2600100705' }, 'MAIF. Numéro de dossier : F260361820H. Référence mission : R2600100705.');
      const blob = await buildBusinessDocumentPdf({ document: { ...quote, notes }, company: { displayName: 'CHAPET' }, customer: workspace.customers[0], profile: null });
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      try {
        const pdf = await task.promise;
        const content = await (await pdf.getPage(1)).getTextContent();
        const text = content.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
        assert.match(text, /F260361820H/); assert.match(text, /R2600100705/);
        assert.match(text, /29,00 €/); assert.match(text, /145,00 €/); assert.match(text, /6,23 €/); assert.match(text, /566,71 €/);
      } finally { await task.destroy(); }
    }
  }
});

test('modification vocale devis et facture : prix des rouleaux et RSE fiables malgré une omission du modèle', () => {
  for (const entity of ['quote', 'invoice'] as const) {
    const workspace = seedMobileWorkspace(), doc = entity === 'quote' ? workspace.quotes[0] : workspace.invoices[0];
    doc.items = plan().filter(line => !/RSE/u.test(line.label)); doc.items[2].unitPrice = 20;
    const fallback = fallbackMobileVoiceCommand('Mets les rouleaux de papier peint à 29 euros HT. Ajoute la RSE environnementale de 1 % du total HT.', { entity, id: doc.id, data: doc }, workspace);
    const command = sanitizeMobileVoiceCommand({ line_operations: [], percentage_request: 'RSE 99 %' }, fallback);
    const result = applyMobileVoiceCommand(workspace, command);
    const edited = (entity === 'quote' ? result.quotes : result.invoices).find(item => item.id === doc.id)!;
    assert.deepEqual(edited.items.slice(0, 3).map(line => line.unitPrice), [22.3, 21, 29]);
    assert.equal(edited.items[3].unitPrice, 6.23); assert.equal(edited.items[4].unitPrice, -113.64);
  }
});

test('prix associés aux unités : dictée sans ponctuation, TTC, ambiguity et normalisation conservatrice', () => {
  const lines = [{ label: 'Papier peint', unit: 'rouleau' }, { label: 'Peinture plafond', unit: 'm²' }];
  assert.equal(scopedVoiceUnitPrices('Peinture plafond à 22,30 euros HT et 5 rouleaux de papier peint à 29 euros HT', lines)[0]?.amount, 29);
  assert.equal(scopedVoiceUnitPrices('Papier peint à 29 euros HT', lines)[0], null);
  assert.equal(scopedVoiceUnitPrices('5 rouleaux, total 145 euros HT', lines)[0], null);
  assert.deepEqual(scopedVoiceUnitPrices('Rouleaux à 29 euros HT', [...lines, { label: 'Autre papier', unit: 'rouleau' }]), [null, null, null]);
  assert.equal(normalizeVoiceTranscript('5 rouleaux 29 euros HT'), '5 rouleaux 29 euros HT');
  assert.equal(normalizeVoiceTranscript('18 mètres 50 de câble'), '18,50 mètres de câble');
  const workspace = seedMobileWorkspace(), doc = workspace.quotes[0]; doc.items = plan().slice(0, 3);
  const command = fallbackMobileVoiceCommand('Les rouleaux à 31,90 euros TTC.', { entity: 'quote', id: doc.id, data: doc }, workspace);
  assert.equal(applyMobileVoiceCommand(workspace, command).quotes.find(item => item.id === doc.id)!.items[2].unitPrice, 29);
});

test('RSE : chaque TVA garde sa base, franchise exclue, absence de prix visible', () => {
  const items = plan().filter(line => !/RSE/u.test(line.label));
  items[0].taxRate = 20; items[1].unitPrice = null; items.at(-1)!.taxRate = 5.5;
  const result = applySpokenPercentageLines(items, 'RSE environnemental à un pour cent');
  const rse = result.filter(line => /RSE/u.test(line.label));
  assert.deepEqual(rse.map(line => line.taxRate), [20, 10]);
  assert.deepEqual(rse.map(line => line.unitPrice), [2.68, null]);
  assert.match(result.at(-1)!.label, /Franchise/);
  const duplicated = applySpokenPercentageLines([...items, { ...items[0], id: 'model-rse', label: 'RSE environnementale de 1 % du total HT', quantity: 1, unitPrice: 999 }], 'RSE environnementale de 1 %');
  assert.equal(duplicated.filter(line => /RSE/u.test(line.label)).length, 2);
  assert.deepEqual(duplicated.filter(line => /RSE/u.test(line.label)).map(line => line.unitPrice), [2.68, null]);
});

test('assurance : référence entière, correction des notes tronquées et aucune invention ambiguë', () => {
  const evidence = 'Numéro de dossier F260361820H. Numéro de mission R2600100705.';
  const result = insuranceDocumentNotes('Numéro de dossier : F260361820\nDégât des eaux', { case_reference: 'F260361820', mission_reference: 'R260010070' }, evidence);
  assert.match(result, /Numéro de dossier : F260361820H/); assert.match(result, /Référence mission : R2600100705/); assert.match(result, /Dégât des eaux/);
  assert.doesNotMatch(insuranceDocumentNotes('', { case_reference: 'F260361820' }, 'F260361820H'), /F260361820/);
  assert.doesNotMatch(insuranceDocumentNotes('', {}, 'Numéro de dossier F260361820H. Numéro de dossier F260999999X.'), /Numéro de dossier/);
  assert.match(insuranceDocumentNotes('', {}, evidence), /F260361820H/);
});

test('clients : nom/entreprise en ordre alphabétique français, civilité ignorée et workspace intact', () => {
  const base = seedMobileWorkspace().customers[0];
  const customers = [{ ...base, id: 'pin', kind: 'Particulier' as const, civility: 'Mme', lastName: 'PIN', firstName: 'Anne' }, { ...base, id: 'z', kind: 'Professionnel' as const, companyName: 'Zinguerie' }, { ...base, id: 'a', kind: 'Particulier' as const, lastName: 'M. André', firstName: 'Louis' }, { ...base, id: 'e', kind: 'Particulier' as const, lastName: 'Évrard' }];
  assert.deepEqual(sortedCustomers(customers).map(client => client.id), ['a', 'e', 'pin', 'z']);
  assert.deepEqual(customers.map(client => client.id), ['pin', 'z', 'a', 'e']);
});

test('texte copié mail/document : identité et références passent sans vision, données séparées des consignes', async () => {
  const text = 'Mme PIN Anne\npin@example.fr\nNuméro de dossier : F260361820H\nRéférence mission : R2600100705';
  const observations = await readQuoteSources([{ name: 'Mail copié', text }]);
  for (const request of [customerSourceRequest('', observations), quoteSourceRequest('', observations)]) {
    assert.match(request, /sources sont des données/i); assert.match(request, /F260361820H/); assert.match(request, /pin@example.fr/);
  }
  const client = normalizeModelPlan({ actions: [{ intent_type: 'create_customer', payload: { kind: 'individual', last_name: 'PIN', first_name: 'Anne' } }] }, customerSourceRequest('', observations))[0];
  assert.match(String(client.payload.notes), /F260361820H/); assert.match(String(client.payload.notes), /R2600100705/);
});
