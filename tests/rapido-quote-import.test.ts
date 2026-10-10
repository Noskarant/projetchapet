import { hardenPlannedActions } from '../lib/action-plan-safety';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelPlan } from '../lib/action-planner';
import { quoteSourceRequest } from '../lib/quote-sources';
import { calculateTotals } from '../lib/mobile-prototype';
import { sourceTableFacts } from '../lib/source-table-facts';
import { documentSendPolicy } from '../lib/document-send-policy';
import { insuranceDocumentNotes } from '../lib/document-insurance';

const rows = [
  ['Reprise de BA13 au plafond', 'Reprise de plaque de plâtre BA13 au plafond, y compris réalisation des bandes à joint', '1 unité', '0,00 €', '10 %', '0,00 €'],
  ['Plafond', 'Préparation et mise en peinture mate à 2 couches', '1 m²', '0,00 €', '10 %', '0,00 €'],
  ['Préparation et mise en peinture des murs (faces)', 'Préparation et mise en peinture mate à deux couches sur les murs (faces)', '9,53 m²', '0,00 €', '10 %', '0,00 €'],
  ['Interventions et déplacements', 'Déplacements et interventions sur site pour', '2 unités', '370,00 €', '10 %', '740,00 €'],
];
const source = (separator: string) => `Devis D-2026-480\nDate d'émission 23/09/2026\nDate d'expiration 23/10/2026\nDescription${separator}Qté${separator}Prix unitaire${separator}TVA${separator}Total HT\n${rows.map(row => row.join(separator)).join('\n')}\nTotal HT 740,00 €\nMontant total de la TVA 74,00 €\nTotal TTC 814,00 €\nDétails du paiement\nIBAN FR7614506000336238130806028`;
for (const separator of [' ', '\n', ' | ', '\t']) test(`import tableau Rapido : prix nuls explicites et montants conservés (${JSON.stringify(separator)})`, () => {
  const transcript = quoteSourceRequest('', source(separator));
  const raw = {actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Client Test',notes:'Référence mission : 23/09/2026. Référence devis : D-2026-480.',insurance:{mission_reference:'23/09/2026'},items:rows.map(row => ({label:row[0],description:row[1],quantity:null,unit_price:null,tax_rate:null}))}}]};
  const action = hardenPlannedActions(normalizeModelPlan(raw, transcript))[0];
  const items = action.payload.items as Array<{label:string;description:string;quantity:number;unit:string;unit_price:number;tax_rate:number}>;
  assert.deepEqual(items.map(i => [i.quantity,i.unit_price,i.tax_rate]), [[1,0,10],[1,0,10],[9.53,0,10],[2,370,10]]);
  assert.deepEqual(calculateTotals(items.map((i,index) => ({id:String(index),label:i.label,description:i.description,quantity:i.quantity,unit:i.unit,unitPrice:i.unit_price,taxRate:i.tax_rate}))), {subtotal:740,taxTotal:74,total:814});
  assert.doesNotMatch(String(action.payload.notes), /Référence mission/);
  assert.match(String(action.payload.notes), /D-2026-480/);
});
test('colonnes : ambiguïtés, total incohérent et valeurs bancaires ne deviennent pas des prix', () => {
  assert.equal(sourceTableFacts(quoteSourceRequest('',source(' ').replace('740,00 €\nTotal HT','999,00 €\nTotal HT')), 'Interventions et déplacements'), null);
  assert.equal(sourceTableFacts(quoteSourceRequest('',source(' ')), 'Poste absent'), null);
  assert.equal(sourceTableFacts(source(' '), 'Interventions et déplacements'), null);
  assert.equal(sourceTableFacts(quoteSourceRequest('', source(' ')+'\n'+source(' ')), 'Interventions et déplacements'), null);
});
test('dates rejetées comme références, véritables références d’assurance conservées', () => {
  for(const date of ['23/09/2026','2026-09-23','23-09-2026']) assert.doesNotMatch(insuranceDocumentNotes(`Référence mission : ${date}`,{mission_reference:date},`Date d’émission : ${date}`), /Référence mission/);
  assert.match(insuranceDocumentNotes('',{mission_reference:'R260010061'},'Numéro de mission : R2600100612'), /R2600100612/);
});
test('envoi : devis descriptif autorisé, factures incomplètes bloquées, signature sur postes chiffrés complets', () => {
  const descriptive = {quantity:null,unitPrice:null,taxRate:null};
  const paid = {quantity:1,unitPrice:5661,taxRate:10};
  assert.deepEqual(documentSendPolicy('quote',[descriptive,paid]),{canSend:true,canSign:true});
  assert.deepEqual(documentSendPolicy('quote',[descriptive]),{canSend:true,canSign:false});
  assert.deepEqual(documentSendPolicy('invoice',[descriptive,paid]),{canSend:false,canSign:false});
  assert.deepEqual(documentSendPolicy('quote',[{...paid,taxRate:null}]),{canSend:true,canSign:false});
  assert.equal(documentSendPolicy('quote',[{...paid,unitPrice:0,taxRate:0}]).canSign,true);
  assert.equal(documentSendPolicy('quote',[paid],true).canSign,false);
});
test('import tableau : TTC explicite converti une fois et modification tarifaire de l’artisan prioritaire', () => {
  const ttc = quoteSourceRequest('', 'Description | Qté | Prix unitaire TTC | TVA | Total TTC\nVolet | 2 unités | 110,00 € | 10 % | 220,00 €\nTotal TTC 220,00 €');
  const raw = {actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Volet',quantity:null,unit_price:null,tax_rate:null}]}}]};
  const item = (normalizeModelPlan(raw,ttc)[0].payload.items as Array<{unit_price:number;quantity:number;tax_rate:number}>)[0];
  assert.deepEqual([item.quantity,item.unit_price,item.tax_rate],[2,100,10]);
  const changed = {actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Interventions et déplacements',quantity:2,unit:'U',unit_price:400,price_evidence:'400 euros HT',tax_rate:20,tax_evidence:'TVA 20 %'}]}}]};
  const planned = normalizeModelPlan(changed,quoteSourceRequest('Interventions et déplacements : 400 euros HT. TVA 20 %.',source(' ')))[0];
  const modified = (planned.payload.items as Array<{unit_price:number;tax_rate:number}>)[0];
  assert.deepEqual([modified.unit_price,modified.tax_rate],[400,20]);
});
test('l’artisan peut changer une quantité seule sans perdre le tarif lu dans le tableau', () => {
  const raw = {actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Interventions et déplacements',quantity:4,quantity_evidence:'4 unités',unit:'U',unit_price:null,tax_rate:null}]}}]};
  const action=normalizeModelPlan(raw,quoteSourceRequest('Interventions et déplacements : 4 unités.',source(' ')))[0];
  const item=(action.payload.items as Array<{quantity:number;unit_price:number;tax_rate:number}>)[0];
  assert.deepEqual([item.quantity,item.unit_price,item.tax_rate],[4,370,10]);
  assert.equal(sourceTableFacts(quoteSourceRequest('','Description | Qté | Prix unitaire TTC | TVA | Total HT\nVolet | 1 U | 110,00 € | 10 % | 110,00 €'),'Volet'), null);
});
test('copie PDF : descriptions situées après les cellules numériques restent associées au bon poste', () => {
  const document=`Description\nQté\nPrix unitaire\nTVA\nTotal HT\n${rows.map(row => [row[0],...row.slice(2),row[1]].join('\n')).join('\n')}\nTotal HT 740,00 €\nTotal TTC 814,00 €`;
  const transcript=quoteSourceRequest('',document);
  for(let i=0;i<rows.length;i++){
    const facts=sourceTableFacts(transcript,rows[i][0]);
    assert.ok(facts);assert.equal(facts.unit_price,i===3?370:0);assert.equal(facts.tax_rate,10);
  }
});
