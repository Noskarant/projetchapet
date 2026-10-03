import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuoteSuggestion, buildQuoteSuggestions, learnedSellingPrice, type PriceHistoryQuote } from '../lib/quote-suggestions';
import { normalizeQuote, type MobileQuote } from '../lib/mobile-prototype';
import { recalculatePercentageLines } from '../lib/percentage-adjustments';
import { proposeLearnedSellingPrices } from '../lib/learned-selling-prices-server';
import { plannedActionFromParsed } from '../lib/action-planner';

const quote: MobileQuote = { id:'new',number:'D-1',customerId:'c',customerName:'Dupont',title:'Peinture salon',status:'En attente',issueDate:'2026-10-01',expiryDate:'2026-11-01',notes:'',subtotal:0,taxTotal:0,total:0,items:[{id:'p',label:'Peinture murs',description:'',quantity:10,unit:'m²',unitPrice:null,taxRate:10}] };
const history: PriceHistoryQuote[] = [20,30,100].map((price,i)=>({id:String(i),status:'accepted',items:[{label:'Peinture murs',unit:'m2',unit_price:price}]}));

test('apprend le tarif médian de devis validés avec désignation et unité identiques',()=>{
  assert.deepEqual(learnedSellingPrice('Peinture murs','m²',history),{unitPrice:30,samples:3});
  assert.equal(learnedSellingPrice('Peinture plafond','m²',history),null);
  assert.equal(learnedSellingPrice('Peinture murs','forfait',history),null);
  assert.equal(learnedSellingPrice('Peinture murs','m²',history.map(q=>({...q,status:'draft'}))),null);
  assert.equal(learnedSellingPrice('RSE (1 %)','forfait',history),null);
});
test('ne réapprend ni le devis courant ni les prix nuls ou contradictoires',()=>{
  assert.equal(learnedSellingPrice('Peinture murs','m²',[history[0]],'0'),null);
  assert.equal(learnedSellingPrice('Peinture murs','m²',[{...history[0],items:[...history[0].items,{label:'Peinture murs',unit:'m²',unit_price:70}]}]),null);
  assert.equal(learnedSellingPrice('Peinture murs','m²',[{...history[0],items:[{label:'Peinture murs',unit:'m²',unit_price:null}]}]),null);
});
test('les suggestions sont ciblées, limitées et ne doublonnent pas les protections',()=>{
  const suggestions=buildQuoteSuggestions(quote,history);
  assert.equal(suggestions[0].lineId,'p');
  assert.equal(suggestions.length,3);
  assert.equal(buildQuoteSuggestions({...quote,items:[...quote.items,{...quote.items[0],id:'prot',label:'Bâchage des sols'}]}).some(s=>s.id==='protection'),false);
  assert.deepEqual(buildQuoteSuggestions({...quote,status:'Validé'},history),[]);
  assert.deepEqual(buildQuoteSuggestions({...quote,title:'Conseil',items:[]}),[]);
});
test('le tarif confirmé préserve les quantités et la TVA, les prix renseignés sont protégés',()=>{
  const suggestion=buildQuoteSuggestions(quote,history)[0];
  const updated=applyQuoteSuggestion(quote,suggestion,{quantity:99,unitPrice:30,taxRate:20,id:'x'});
  assert.equal(updated.items[0].quantity,10); assert.equal(updated.items[0].taxRate,10);
  assert.equal(normalizeQuote(updated).total,330);
  assert.throws(()=>applyQuoteSuggestion(updated,suggestion,{quantity:10,unitPrice:30,taxRate:10,id:'x'}),/déjà/);
});
test('ajouter un poste recalcule la RSE et refuse les doublons ou une saisie incomplète',()=>{
  const current={...quote,items:[{...quote.items[0],unitPrice:30},{...quote.items[0],id:'rse',label:'RSE (1 %)',description:'Calcul automatique : 1 % du montant HT des autres postes.',unit:'forfait',quantity:1,unitPrice:3}]};
  const suggestion=buildQuoteSuggestions(current).find(s=>s.id==='protection')!;
  const updated=applyQuoteSuggestion(current,suggestion,{quantity:1,unitPrice:100,taxRate:10,id:'protect'});
  assert.equal(recalculatePercentageLines(updated.items).find(i=>i.id==='rse')?.unitPrice,4);
  assert.throws(()=>applyQuoteSuggestion(updated,suggestion,{quantity:1,unitPrice:100,taxRate:10,id:'again'}),/déjà/);
  assert.throws(()=>applyQuoteSuggestion(current,suggestion,{quantity:NaN,unitPrice:100,taxRate:10,id:'x'}),/Complète/);
});
test('le plan vocal lit seulement les devis validés de son entreprise et préserve les prix dictés',async()=>{
  const calls:unknown[][]=[];
  const chain={select:(...args:unknown[])=>{calls.push(['select',...args]);return chain;},eq:(...args:unknown[])=>{calls.push(['eq',...args]);return chain;},order:()=>chain,limit:async()=>({data:history,error:null})};
  const client={from:(table:string)=>{assert.equal(table,'quotes');return chain;}} as unknown as Parameters<typeof proposeLearnedSellingPrices>[2];
  const action=plannedActionFromParsed('quote',{customer_hint:'Dupont',items:[{label:'Peinture murs',unit:'m²',quantity:10,unit_price:null},{label:'Peinture murs',unit:'m²',unit_price:0},{label:'Peinture murs',unit:'m²',unit_price:45}]},'Peinture murs pour Dupont');
  (action.payload.items as Array<Record<string, unknown>>).push({label:'Peinture murs',unit:'m²',unit_price:null,spoken_price_ttc:60});
  action.warnings.push('Ligne 1 : prix unitaire absent.', 'Adresse à préciser.');
  await proposeLearnedSellingPrices([action],'company-A',client);
  assert.ok(calls.some(call=>call[1]==='organization_id'&&call[2]==='company-A'));
  assert.ok(calls.some(call=>call[1]==='status'&&call[2]==='accepted'));
  const items=action.payload.items as Array<{unit_price:number;price_source?:string}>;
  assert.deepEqual(items.map(i=>i.unit_price),[30,0,45,null]);
  assert.equal(items[0].price_source,'company_history');
  assert.ok(!action.warnings.includes('Ligne 1 : prix unitaire absent.'));
  assert.ok(action.warnings.includes('Adresse à préciser.'));
  assert.match(action.warnings.at(-1)!,/Modifiable dans le devis/);
});
test('un historique indisponible ne bloque pas le devis et ne fournit aucun prix inventé',async()=>{
  const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:async()=>({data:null,error:new Error('offline')})};
  const client={from:()=>chain} as unknown as Parameters<typeof proposeLearnedSellingPrices>[2];
  const action=plannedActionFromParsed('quote',{items:[{label:'Peinture murs',unit:'m²',unit_price:null}]},'Peinture murs');
  await proposeLearnedSellingPrices([action],'company-A',client);
  assert.equal((action.payload.items as Array<{unit_price:null}>)[0].unit_price,null);
  assert.match(action.warnings.at(-1)!,/indisponibles/);
});
