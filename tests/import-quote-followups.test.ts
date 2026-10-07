import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteSourceRequest } from '../lib/quote-sources';
import { normalizeModelPlan } from '../lib/action-planner';
import { phoneDisplay, restoreSourcePhone } from '../lib/phone-display';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { calculateTotals, seedMobileWorkspace } from '../lib/mobile-prototype';

const plan=(observations:string,instructions='',tax:number|null=null)=>normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Client Test',items:[{label:'Volet',quantity:1,unit:'forfait',unit_price:100,tax_rate:tax,price_evidence:'100 euros HT'}]}}]},quoteSourceRequest(instructions,observations,30))[0];
test('import : TVA par défaut 10 %, marge et RSE portent sur le HT',()=>{
 const action=plan('Volet : 100 euros HT.','Ajoute RSE 1 %.');
 const items=action.payload.items as Array<{unit_price:number;tax_rate:number}>;
 assert.deepEqual(items.map(i=>[i.unit_price,i.tax_rate]),[[130,10],[1.3,10]]);
 assert.deepEqual(calculateTotals(items.map((i,index)=>({id:String(index),label:'Travaux',description:'',unit:'forfait',quantity:1,unitPrice:i.unit_price,taxRate:i.tax_rate}))),{subtotal:131.3,taxTotal:13.13,total:144.43});
});
test('import : taux explicites préservés, priorité artisan, aucune TVA inventée dans une dictée seule',()=>{
 for(const rate of [0,5.5,20]) assert.equal((plan(`Volet : 100 euros HT. TVA : ${rate} %.`).payload.items as Array<{tax_rate:number}>)[0].tax_rate,rate);
 assert.equal((plan('Volet : 100 euros HT. TVA 20 %.','Applique TVA 5,5 %.').payload.items as Array<{tax_rate:number}>)[0].tax_rate,5.5);
 const spoken=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Volet',quantity:1,unit_price:100,tax_rate:20}]}}]},'Volet : 100 euros HT.')[0];
 assert.equal((spoken.payload.items as Array<{tax_rate:number|null}>)[0].tax_rate,null);
 assert.equal((plan('Désignation | TVA\nPrestation A | 5,5 %\nPrestation B | 20 %\nVolet 100 euros HT.').payload.items as Array<{tax_rate:number|null}>)[0].tax_rate,null);
});
test('téléphones : zéro initial rétabli uniquement avec preuve dans les sources, formats étrangers conservés',()=>{
 const source=quoteSourceRequest('','Coordonnées assuré : téléphone 06 38 51 17 18. Fournisseur : 04 77 54 05 77.');
 assert.equal(restoreSourcePhone('638511718',source),'0638511718');
 assert.equal(restoreSourcePhone('638511719',source),'638511719');
 assert.equal(restoreSourcePhone('638511718','Téléphone 06 38 51 17 18'),'638511718');
 assert.equal(phoneDisplay('0638511718'),'06 38 51 17 18');
 assert.equal(phoneDisplay('+33638511718'),'+33 6 38 51 17 18');
 assert.equal(phoneDisplay('+442012345678'),'+442012345678');
 const customer=normalizeModelPlan({actions:[{intent_type:'create_customer',payload:{kind:'individual',last_name:'Test',phones:['638511718']}}]},source)[0];
 assert.deepEqual(customer.payload.phones,['0638511718']);
});
test('PDF : téléphones lisibles, références non doublées et signature sur une page pour un devis court',async()=>{
 const workspace=seedMobileWorkspace();
 const items=[{id:'l1',label:'Volet aluminium',description:'Fourniture et pose',quantity:1,unit:'forfait',unitPrice:2470,taxRate:10}];
 const quote={...workspace.quotes[0],items,...calculateTotals(items),notes:'Assureur : MAIF\nRéférence mission : R2600096337\nNuméro de dossier : M260721414M\nAdresse du sinistre : 700 route des Carrières, 42380 Luriecq\nTravaux à convenir avec le client.'};
 const customer={...workspace.customers[0],phones:['0638511718','0477540577']};
 const blob=await buildBusinessDocumentPdf({document:quote,customer,company:{displayName:'Entreprise Test',phone:'0477540577'},profile:null});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 try {
  const pdf=await task.promise;assert.equal(pdf.numPages,1);
  const text=(await(await pdf.getPage(1)).getTextContent()).items.flatMap(i=>'str'in i?[i.str]:[]).join(' ');
  assert.match(text,/Tél\. : 06 38 51 17 18/);assert.match(text,/Tél\. : 04 77 54 05 77/);
  assert.equal(text.split('R2600096337').length-1,1);assert.match(text,/BON POUR ACCORD/);assert.match(text,/Travaux à convenir avec le client/);
 }finally{await task.destroy()}
});
