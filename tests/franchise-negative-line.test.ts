import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelPlan, plannedActionFromParsed } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';
import { documentLinePrice, isDeductibleLine, spokenDeductibleAdjustment } from '../lib/document-deductible';
import { calculateTotals, convertQuoteToInvoice, seedMobileWorkspace, type LineItem } from '../lib/mobile-prototype';
import { calculateQuotePreviewTotals, quoteTaxBreakdown } from '../lib/mobile-quote-preview';
import { normalizeMobileWorkspace } from '../lib/mobile-workspace-storage';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';

const model = {customer_hint:'Client test',items:[{label:'Peinture murs',quantity:100,unit:'m²',unit_price:23,tax_rate:10}]};
const lines = (items: Array<Record<string,unknown>>): LineItem[] => items.map((item,index) => ({id:String(index),label:String(item.label),description:String(item.description || ''),quantity:item.quantity as number|null,unit:item.unit as string|null,unitPrice:item.unit_price as number|null,taxRate:item.tax_rate as number|null}));
const plan = (phrase: string, tax = 10) => hardenPlannedActions(normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:model}]},`Peinture murs 100 m² à 23 euros HT. TVA ${tax} %. ${phrase}`))[0];

test('franchise TTC : 125 € à 10 % crée -113,64 HT et réduit les vrais totaux, puis passe dans la facture et le cache', () => {
  const action = plan('Franchise à récupérer 125 euros TTC.');
  const items = lines(action.payload.items as Array<Record<string,unknown>>);
  assert.equal(action.status,'ready'); assert.deepEqual(action.warnings,[]);
  assert.equal(items[0].unitPrice,23); assert.equal(items[1].unitPrice,-113.64);
  assert.deepEqual(calculateTotals(items),{subtotal:2186.36,taxTotal:218.64,total:2405});
  const workspace = seedMobileWorkspace();
  const quote = {...workspace.quotes[0],items,notes:String(action.payload.notes || ''),...calculateTotals(items)};
  const invoice = convertQuoteToInvoice(workspace,quote).invoice;
  assert.equal(invoice.items[1].unitPrice,-113.64); assert.equal(invoice.total,2405);
  const restored = normalizeMobileWorkspace({...workspace,quotes:[quote],invoices:[invoice]},workspace);
  assert.equal(restored.quotes[0].items[1].unitPrice,-113.64); assert.equal(restored.invoices[0].total,2405);
  const legacy = plannedActionFromParsed('quote',{...model,items:[...model.items,{label:'Franchise TTC',quantity:1,unit_price:-125,tax_rate:10}]},'Peinture murs 100 m² à 23 euros HT. TVA 10 %. Franchise de 125 euros TTC.');
  assert.equal(lines(legacy.payload.items as Array<Record<string,unknown>>).filter(isDeductibleLine).length,1);
  assert.equal(lines(legacy.payload.items as Array<Record<string,unknown>>)[1].unitPrice,-113.64);
});

test('HT, TTC, mots et taux 0/5,5/10/20 : conversion explicite uniquement, sans changer le prix des travaux', () => {
  for (const [phrase,tax,price,total] of [
    ['Franchise 125 euros HT.',10,-125,2392.5],
    ['Franchise à récupérer cent vingt cinq euros toutes taxes comprises.',10,-113.64,2405],
    ['Franchise TTC de 125 euros.',20,-104.17,2635],
    ['Franchise TTC à récupérer 125 euros.',10,-113.64,2405],
    ['Franchise à récupérer HT : 125 euros.',10,-125,2392.5],
    ['Franchise à déduire 125 € TTC.',5.5,-118.48,2301.5],
    ['Franchise à récupérer 125 € TTC.',0,-125,2175],
  ] as const) {
    const items = lines(plan(phrase,tax).payload.items as Array<Record<string,unknown>>);
    assert.equal(items[0].unitPrice,23,phrase); assert.equal(items[0].taxRate,tax,phrase);
    assert.equal(items[1].unitPrice,price,phrase); assert.equal(calculateTotals(items).total,total,phrase);
  }
  assert.deepEqual(spokenDeductibleAdjustment('Franchise à récupérer 125 € TTC avec TVA 20 %'),{amount:125,priceType:'ttc',taxRate:20});
  const scoped = lines(plan('Franchise à récupérer 125 € TTC avec TVA 20 %.').payload.items as Array<Record<string,unknown>>);
  assert.equal(scoped[0].taxRate,10); assert.equal(scoped[1].taxRate,20); assert.equal(scoped[1].unitPrice,-104.17);
  const instructions = lines(plan('Franchise 125 euros TTC.\nInformations issues des sources à vérifier\nFranchise à récupérer : 150 euros.').payload.items as Array<Record<string,unknown>>);
  assert.equal(instructions.at(-1)!.unitPrice,-113.64);
  assert.deepEqual(spokenDeductibleAdjustment('Franchise HT de 125 euros TTC'),{amount:125,priceType:null,taxRate:null});
});

test('remise et RSE restent calculées sur les travaux ; la franchise fixe n’est ni majorée ni remisée', () => {
  const action = plan('RSE 1 %, remise de 4 %. Franchise de 125 euros TTC.');
  const items = lines(action.payload.items as Array<Record<string,unknown>>);
  assert.equal(items[1].unitPrice,23); assert.equal(items[2].unitPrice,-113.64);
  const changed = items.map((item,index)=>index===0?{...item,quantity:200}:item);
  assert.equal(calculateTotals(changed).subtotal,4532.36);
  const totals = calculateQuotePreviewTotals(items,4);
  assert.equal(totals.discountAmount,92.92); assert.equal(totals.total,2328.08);
  assert.deepEqual(quoteTaxBreakdown(items,4),[{rate:10,amount:211.64}]);
  const workspace=seedMobileWorkspace(), quote={...workspace.quotes[0],items,...calculateTotals(items)};
  const invoice=convertQuoteToInvoice(workspace,quote,4).invoice;
  assert.equal(invoice.items[2].unitPrice,-113.64); assert.equal(invoice.total,totals.total);
});

test('une franchise sans HT/TTC ou avec TVA inconnue conserve son montant à relire ; aucun calcul arbitraire', () => {
  const unspecified=lines(plan('Franchise à récupérer 125 euros.').payload.items as Array<Record<string,unknown>>);
  assert.equal(unspecified[1].unitPrice,null); assert.match(unspecified[1].description,/HT ou TTC à préciser/);
  const noTax=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:model}]},'Peinture murs 100 m² à 23 euros HT. Franchise 125 euros TTC.')[0];
  const items=lines(noTax.payload.items as Array<Record<string,unknown>>);
  assert.equal(items[0].taxRate,null); assert.equal(items[1].unitPrice,null);
  const mixed=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Pose',quantity:1,unit_price:100,price_evidence:'100 euros HT',tax_evidence:'TVA 10 %'},{label:'Fourniture',quantity:1,unit_price:100,price_evidence:'100 euros HT',tax_evidence:'TVA 20 %'}]}}]},'Pose 100 euros HT TVA 10 % pour cette ligne. Fourniture 100 euros HT TVA 20 % pour cette ligne. Franchise 125 euros TTC.')[0];
  assert.equal(lines(mixed.payload.items as Array<Record<string,unknown>>).at(-1)!.unitPrice,null);
  assert.equal(documentLinePrice(-113.64,'Franchise à déduire'),-113.64);
  assert.equal(documentLinePrice(-113.64,'Peinture'),0);
});

test('le PDF affiche un poste négatif et les totaux corrigés, sans une seconde franchise après le total', async () => {
  const items=lines(plan('Franchise 125 euros TTC.').payload.items as Array<Record<string,unknown>>);
  const workspace=seedMobileWorkspace();
  const blob=await buildBusinessDocumentPdf({document:{...workspace.quotes[0],items,notes:'Franchise à déduire du montant TTC : 125,00 €.',...calculateTotals(items)},customer:workspace.customers[0],company:{displayName:'CHAPET'},profile:null});
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
  try {
    const pdf=await task.promise, content=await (await pdf.getPage(1)).getTextContent();
    const text=content.items.flatMap(item=>'str' in item?[item.str]:[]).join(' ');
    assert.match(text,/-113,64 €/); assert.match(text,/Franchise à déduire/); assert.match(text,/TOTAL TTC.*2 405,00 €/);
    assert.doesNotMatch(text,/Montant après franchise|Part client \(franchise\)/);
  } finally {await task.destroy();}
});
