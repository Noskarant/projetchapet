import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMobileVoiceCommand, fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from '../lib/mobile-voice-command';
import { calculateQuotePreviewTotals, quoteTaxBreakdown } from '../lib/mobile-quote-preview';
import { calculateTotals, convertQuoteToInvoice, seedMobileWorkspace, type MobileWorkspace } from '../lib/mobile-prototype';
import { applySpokenPercentageLines } from '../lib/percentage-adjustments';
import { isDeductibleLine } from '../lib/document-deductible';
import { normalizeModelPlan } from '../lib/action-planner';
import { quoteSourceRequest } from '../lib/quote-sources';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';

function fixture() {
  const workspace = seedMobileWorkspace();
  const items = applySpokenPercentageLines([{ id: 'work', label: 'Porte-fenêtre PVC', description: 'Fourniture et pose', quantity: 1, unit: 'forfait', unitPrice: 2640, taxRate: 10 }], 'RSE 1 %');
  workspace.quotes = [{ ...workspace.quotes[0], items, ...calculateTotals(items), notes: 'Franchise : 135 € TTC à déduire. Assurance : MAIF, dossier M260849658N, mission R260008815.' }];
  return workspace;
}

function edit(workspace: MobileWorkspace, text: string, raw?: unknown) {
  const quote = workspace.quotes[0];
  const fallback = fallbackMobileVoiceCommand(text, { entity: 'quote', id: quote.id, data: quote }, workspace);
  const command = sanitizeMobileVoiceCommand(raw, fallback);
  return { command, workspace: applyMobileVoiceCommand(workspace, command) };
}

test('remise 4 % et franchise 135 TTC : le modèle qui ne propose que des notes ne peut pas oublier la déduction', () => {
  const original = fixture();
  const { command, workspace } = edit(original, 'Mets une remise de 4 % et déduis une franchise de 135 euros TTC.', {
    changes: { notes: original.quotes[0].notes }, line_operations: [],
  });
  assert.equal(command.changes?.discount_percent, 4);
  const quote = workspace.quotes[0];
  assert.equal(quote.items.length, 3);
  assert.equal(quote.items.find(isDeductibleLine)?.unitPrice, -122.73);
  assert.equal(quote.items[1].unitPrice, 26.4);
  const before = calculateQuotePreviewTotals(original.quotes[0].items, 4);
  const after = calculateQuotePreviewTotals(quote.items, 4);
  assert.equal(before.total, 2815.71);
  assert.equal(after.total, 2680.71);
  assert.equal(before.discountAmount, after.discountAmount);
  assert.deepEqual(quoteTaxBreakdown(quote.items, 4), [{ rate: 10, amount: 243.7 }]);
  assert.match(quote.notes, /M260849658N/);
  assert.doesNotMatch(quote.notes, /Franchise :/);
  assert.equal(original.quotes[0].items.length, 2);
  assert.deepEqual(workspace.invoices, original.invoices);
  assert.deepEqual(convertQuoteToInvoice({ ...workspace, invoices: [] }, quote, 4).invoice.total, after.total);
});

test('redicter ou corriger la franchise ne cumule pas les déductions et conserve son identifiant', () => {
  let { workspace } = edit(fixture(), 'Déduis la franchise de 135 euros TTC.');
  workspace.quotes[0].items.find(isDeductibleLine)!.id = 'persisted-line-id';
  for (let i = 0; i < 2; i++) workspace = edit(workspace, 'Franchise de 150 euros HT à déduire.', {
    line_operations: [{ action: 'add', designation: 'Franchise', quantite: 1, unite: 'forfait', prix_unitaire_ht: -150, taux_tva: 10 }],
  }).workspace;
  const franchises = workspace.quotes[0].items.filter(isDeductibleLine);
  assert.equal(franchises.length, 1);
  assert.equal(franchises[0].id, 'persisted-line-id');
  assert.equal(franchises[0].unitPrice, -150);
  assert.equal(calculateQuotePreviewTotals(workspace.quotes[0].items, 4).total, 2650.71);
});

test('les mentions dans les notes, la franchise à récupérer et une déduction refusée ne changent pas les montants', () => {
  for (const text of ['Ajoute en notes : franchise à récupérer de 135 euros TTC.', 'Ne déduis pas la franchise de 135 euros TTC.', 'Ne pas déduire la franchise de 135 euros TTC.', 'Sans déduire la franchise de 135 euros TTC.', 'Change le titre en Travaux.']) {
    const original = fixture();
    const { command, workspace } = edit(original, text);
    assert.equal(command.deductible_request, undefined);
    assert.deepEqual(workspace.quotes[0].items, original.quotes[0].items);
  }
});

test('TVA multiples ou HT/TTC absent : la déduction reste à préciser, aucun taux ni montant HT inventé', () => {
  for (const text of ['Déduis la franchise de 135 euros TTC.', 'Déduis la franchise de 135 euros.']) {
    const original = fixture();
    original.quotes[0].items.push({ id: 'other', label: 'Autre prestation', description: '', quantity: 1, unit: 'forfait', unitPrice: 100, taxRate: 20 });
    const { workspace } = edit(original, text);
    const line = workspace.quotes[0].items.find(isDeductibleLine)!;
    assert.equal(line.unitPrice, null);
    assert.equal(line.taxRate, null);
  }
});

test('création depuis sources : la demande artisan de remise et déduction prime sur la franchise à récupérer du document', () => {
  const [action] = normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: {
    customer_hint: 'Client Test', notes: fixture().quotes[0].notes,
    items: [{ label: 'Porte-fenêtre PVC', quantity: 1, unit: 'forfait', unit_price: 2640, price_type: 'ht', price_evidence: '2640 euros HT', tax_rate: 10 }],
  } }] }, quoteSourceRequest('RSE 1 %, remise de 4 %, déduis une franchise de 135 euros TTC.', 'Porte-fenêtre PVC : 2640 euros HT. Franchise à récupérer : 135 euros.'));
  const items = (action.payload.items as Array<Record<string, unknown>>).map((item, index) => ({ id: String(index), label: String(item.label), description: String(item.description), quantity: item.quantity as number | null, unit: item.unit as string | null, unitPrice: item.unit_price as number | null, taxRate: item.tax_rate as number | null }));
  assert.equal(items.filter(isDeductibleLine).length, 1);
  assert.equal(action.payload.discount_percent, 4);
  assert.equal(calculateQuotePreviewTotals(items, 4).total, 2680.71);
  assert.doesNotMatch(String(action.payload.notes), /Franchise à récupérer|Franchise :/);
});

test('export PDF : la franchise déduite apparaît une seule fois et le total imprimé est 2680,71', async () => {
  const { workspace } = edit(fixture(), 'Remise de 4 % et déduis une franchise de 135 euros TTC.');
  const blob = await buildBusinessDocumentPdf({ document: workspace.quotes[0], customer: workspace.customers[0], company: { displayName: 'Entreprise Test' }, profile: null, quoteMeta: { discountPercent: 4, internalNotes: '' } });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) parts.push((await (await pdf.getPage(i)).getTextContent()).items.flatMap(item => 'str' in item ? [item.str] : []).join(' '));
    const text = parts.join(' ');
    assert.equal(text.split('Franchise à déduire').length - 1, 2); // label and its explicit TTC description
    assert.match(text, /135,00 € TTC/);
    assert.match(text, /Remise \(4 %\)/);
    assert.match(text, /2 680,71/);
    assert.doesNotMatch(text, /2 815,71|Montant après franchise|Part client/);
  } finally { await task.destroy(); }
});
