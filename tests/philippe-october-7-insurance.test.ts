import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelPlan } from '../lib/action-planner';
import { quoteSourceRequest } from '../lib/quote-sources';
import { calculateTotals, type LineItem } from '../lib/mobile-prototype';

const observations = `Devis du fournisseur BDA MENUISERIE, destiné à CHAPET Père et Fils.
Description | Qté | Prix unitaire (HT) | TVA | Montant (HT)
Fabrication et pose d’une tapée sur mesure en U avec lasure | 1 | 580,00 € | 0.0 % | 580,00 €
Total HT : 580,00 €. Total TTC : 580,00 €.

Ordre de mission MAIF. Coordonnées assuré : AYMARD MICHELLE.
Numéro de dossier : M260865197H. Référence mission : R2600090647.
Adresse du sinistre : 45 RUE CHARLES DE GAULLE, 1ER ETAGE OUEST, 42000 ST ETIENNE.
Franchise à récupérer : 125 €.`;

test('sources assurance : assuré proposé comme client et 580 HT + 30 % = 754, sans déduire la franchise à récupérer', () => {
  const transcript = quoteSourceRequest('', observations, 30);
  assert.match(transcript, /cet assuré est le client/);
  const actions = normalizeModelPlan({actions:[
    {intent_type:'create_customer',payload:{kind:'individual',last_name:'AYMARD',first_name:'MICHELLE'}},
    {intent_type:'prepare_quote',payload:{customer_from_position:0,title:'Tapée sur mesure',insurance:{insurer:'MAIF',case_reference:'M260865197',mission_reference:'R260009064'},items:[{label:'Fabrication et pose d’une tapée sur mesure en U avec lasure',quantity:1,unit:'forfait',unit_price:580,price_type:'ht',price_evidence:'580,00 €',tax_rate:0,tax_evidence:'Fabrication et pose d’une tapée sur mesure en U avec lasure | 1 | 580,00 € | 0.0 % | 580,00 €'}]}}
  ]},transcript);
  const quote = actions[1];
  assert.equal(quote.customerFromPosition,0);
  const items = quote.payload.items as Array<Record<string,unknown>>;
  assert.equal(items.length,1); assert.equal(items[0].unit_price,754); assert.equal(items[0].tax_rate,0);
  assert.equal(items[0].price_type,'ht');
  assert.match(String(quote.payload.notes), /M260865197H/); assert.match(String(quote.payload.notes), /R2600090647/);
  assert.match(String(quote.payload.notes), /Franchise à récupérer auprès du client : 125,00 €/);
  assert.equal(quote.status,'ready');
  const lines = items.map((line,index):LineItem=>({id:String(index),label:String(line.label),description:'',quantity:line.quantity as number,unit:'forfait',unitPrice:line.unit_price as number,taxRate:line.tax_rate as number}));
  assert.deepEqual(calculateTotals(lines),{subtotal:754,taxTotal:0,total:754});
});

test('sans en-tête probant, le modèle ne peut pas inventer HT ni une TVA nulle', () => {
  const transcript=quoteSourceRequest('Client Test.','Prestation 580,00 €. Total TTC 580,00 €.');
  const action=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Prestation A',quantity:1,unit_price:580,price_type:'ht',price_evidence:'580,00 €',tax_rate:0}]}}]},transcript)[0];
  const line=(action.payload.items as Array<Record<string,unknown>>)[0];
  assert.equal(line.tax_rate,null); assert.notEqual(line.price_type,'ht');
});
