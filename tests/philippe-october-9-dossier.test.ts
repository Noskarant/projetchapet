import assert from 'node:assert/strict';
import test from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {normalizeModelPlan} from '../lib/action-planner';
import {hardenPlannedActions} from '../lib/action-plan-safety';
import {orderVoicePlan} from '../lib/voice-plan-order';
import {resolveVoicePlanCustomers,voiceCustomerMatches} from '../lib/voice-plan-customers';
import {retainSourceQuoteCustomers} from '../lib/source-plan';
import {expandSourcePriceShorthand,normalizeSourceTranscript,quoteSourceRequest} from '../lib/quote-sources';
import {interventionNotes,publicLineDescription} from '../lib/document-intervention-notes';
import {isTranscriptionArtifact} from '../lib/transcription-quality';
import {buildBusinessDocumentPdf} from '../lib/mobile-document-pdf';
import {seedMobileWorkspace,calculateTotals} from '../lib/mobile-prototype';

const backend=(rows:Record<string,unknown>[])=>({from:()=>({select:()=>({eq:(column:string,id:string)=>{
 assert.equal(column,'organization_id'); assert.equal(id,'org');
 return {limit:async()=>({data:rows,error:null})};
}})})}) as unknown as SupabaseClient;
const client={id:'mehl-id',kind:'individual',last_name:'Mehl',first_name:'Emeric',emails:['client@example.fr'],phones:['0612345678'],addresses:[{line1:'35 rue Franklin',postal_code:'42000',city:'Saint-Étienne'}]};
const item=(label:string,price:number|null,evidence='')=>({label,quantity:14,unit:'m²',unit_price:price,price_evidence:evidence,tax_evidence:'TVA 10 %',tax_rate:10});

test('le devis importé retrouve Mehl Emeric malgré ordre inversé et petites erreurs, sans fiche fournisseur bloquante',async()=>{
 const transcript=quoteSourceRequest('Devis pour le monsieur Mel Emric qui est déjà dans la base. Marger à 30 %.','Porte : 1 unité à 100 euros HT. TVA 10 %.');
 const actions=normalizeModelPlan({actions:[
  {intent_type:'create_customer',payload:{kind:'business',company_name:''}},
  {intent_type:'prepare_quote',payload:{customer_hint:'M. Mel Emric',customer_from_position:0,items:[{label:'Porte',quantity:1,unit:'U',unit_price:100,price_evidence:'100 euros HT',tax_evidence:'TVA 10 %'}]}},
 ]},transcript);
 await resolveVoicePlanCustomers(actions,'org',backend([client]));
 const ready=hardenPlannedActions(orderVoicePlan(retainSourceQuoteCustomers(actions)));
 assert.equal(ready.length,1); assert.equal(ready[0].payload.customer_id,client.id);
 assert.equal(ready[0].customerFromPosition,undefined); assert.equal(ready[0].status,'ready');
 assert.equal((ready[0].payload.items as Record<string,unknown>[])[0].unit_price,130);
 assert.equal(voiceCustomerMatches([client],'Emeric Mehl').length,1);
 assert.equal(voiceCustomerMatches([client,{...client,id:'homonym'}],'M. Mel Emric').length,2);
 assert.equal(voiceCustomerMatches([client],'Mel').length,0);
});

test('un client déclaré existant mais introuvable demande une précision sans créer une fiche vide',async()=>{
 const actions=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'M. Inconnu',items:[{label:'Porte'}]}}]},'Reprends le client existant M. Inconnu pour son devis.');
 await resolveVoicePlanCustomers(actions,'org',backend([]));
 assert.equal(actions.length,1); assert.equal(actions[0].status,'needs_input');assert.ok(actions[0].missingFields.includes('client_introuvable'));
});

test('une note complète garde ses lignes, décimales, unités et raccourcis de prix',()=>{
 const copied='ROYER Huguette\nChambre étage\nMur\nRemplacement de papier peint\n42.08 m2 à 22.50\nFournitures, papier peint, 11rx à 27\nPlacard : 1 m² à 22,40 € HT, TVA 10 %\nRSE 1 %\nDéduis une franchise de 135 € TTC';
 const transcript=normalizeSourceTranscript(quoteSourceRequest('',copied));
 assert.match(transcript,/42\.08 m2 à 22\.50 euros\n/);assert.match(transcript,/11 rouleaux à 27 euros\n/);
 assert.equal(expandSourcePriceShorthand('12 m² à 30 € TTC'),'12 m² à 30 € TTC');
 const [quote]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Mme Royer Huguette',items:[
  {label:'Chambre étage, mur, remplacement papier peint',quantity:42.08,quantity_evidence:'42.08 m2',unit:'m²',unit_price:22.5,price_evidence:'22.50 euros'},
  {label:'Fournitures papier peint',quantity:11,quantity_evidence:'11 rouleaux',unit:'rouleaux',unit_price:27,price_evidence:'27 euros'},
  {label:'Placard, peinture',quantity:1,quantity_evidence:'1 m²',unit:'m²',unit_price:22.4,price_evidence:'22,40 € HT'},
 ]}}]},transcript);
 const items=quote.payload.items as Record<string,unknown>[];
 assert.deepEqual(items.slice(0,3).map(i=>[i.quantity,i.unit_price,i.tax_rate]),[[42.08,22.5,10],[11,27,10],[1,22.4,10]]);
 assert.equal(items.length,5);assert.equal(items[3].unit_price,12.66);assert.equal(items[4].unit_price,-122.73);
});

test('des prestations équivalentes reprennent le tarif dicté, les postes différents et prix explicites restent distincts',()=>{
 const transcript='TVA 10 %. Salle à manger, plafond, préparation mise en peinture mat deux couches, 14 m² à 22,40 euros HT. Salon, plafond, préparation mise en peinture mat deux couches, 13 m². Chambre, plafond, préparation mise en peinture mat deux couches, 10 m² à 30 euros HT. Chambre, murs, dépose toile de verre et mise en peinture deux couches 37 m².';
 const actions=hardenPlannedActions(normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[
 item('Salle à manger, plafond, préparation mise en peinture mat deux couches',22.4,'22,40 euros HT'),
 {...item('Salon, plafond, préparation mise en peinture mat deux couches',38),quantity:13},
 {...item('Chambre, plafond, préparation mise en peinture mat deux couches',30,'30 euros HT'),quantity:10},
 item('Chambre, murs, dépose toile de verre et mise en peinture deux couches',null),
 ]}}]},transcript));
 // Two different explicit prices for the same service make inheritance ambiguous.
 assert.equal((actions[0].payload.items as Record<string,unknown>[])[1].unit_price,null);
 const [single]=hardenPlannedActions(normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[
 item('Salle à manger, plafond, préparation mise en peinture mat deux couches',22.4,'22,40 euros HT'),
 {...item('Salon, plafond, préparation mise en peinture mat deux couches',38),quantity:13},
 item('Chambre, murs, dépose toile de verre et mise en peinture deux couches',null),
 ]}}]},transcript.split('Chambre, plafond')[0]));
 const lines=single.payload.items as Record<string,unknown>[];
 assert.equal(lines[1].unit_price,22.4);assert.equal(lines[1].price_source,'same_document');assert.equal(lines[2].unit_price,null);
 assert.ok(single.warnings.some(w=>w.includes('tarif repris')));
});

test('les notes d’intervention cachent les calculs et gardent les accès et franchises',()=>{
 const notes='Suite effraction assurance MAIF\nMajoration RSE de 1 % au total du devis (calculée automatiquement).\nRemise de 4 % sur le total (calculée automatiquement).\nAccès par cour intérieure. Franchise à récupérer : 135 € TTC.';
 assert.equal(interventionNotes(notes),'Suite effraction assurance MAIF\nAccès par cour intérieure. Franchise à récupérer : 135 € TTC.');
 assert.match(interventionNotes('RSE 1 % et accès par la cour.'),/accès par la cour/);
 assert.equal(publicLineDescription('Calcul automatique : 1 % du montant HT des autres postes.'),'');
});

test('le PDF place la note sous l’objet, conserve RSE et remise chiffrées et intègre le logo MANUFEO',async()=>{
 const workspace=seedMobileWorkspace();
 const items=[{id:'paint',label:'Peinture mur',description:'Finition mate',quantity:10,unit:'m²',unitPrice:22.4,taxRate:10},{id:'rse',label:'RSE (1 %)',description:'Calcul automatique : 1 % du montant HT des autres postes.',quantity:1,unit:'forfait',unitPrice:2.24,taxRate:10}];
 const quote={...workspace.quotes[0],title:'Remplacement de colonne',items,...calculateTotals(items),notes:'Suite effraction assurance MAIF\nMajoration RSE de 1 % au total du devis (calculée automatiquement).\nRemise de 4 % sur le total (calculée automatiquement).'};
 const blob=await buildBusinessDocumentPdf({document:quote,customer:workspace.customers[0],company:{displayName:'Test'},profile:null,quoteMeta:{discountPercent:4,internalNotes:''}});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 try{const pdf=await task.promise;assert.equal(pdf.numPages,1);const page=await pdf.getPage(1);const content=(await page.getTextContent()).items.filter(i=>'str'in i);const text=content.map(i=>'str'in i?i.str:'').join(' ');
 assert.match(text,/NOTE D/);assert.match(text,/Suite effraction/);assert.doesNotMatch(text,/NOTES CLIENT|calculée automatiquement|Calcul automatique/);assert.match(text,/RSE \(1 %\)/);assert.match(text,/Remise \(4 %\)/);assert.match(text,/MANUFEO/);
 const note=content.find(i=>'str'in i&&i.str.includes('Suite effraction'));const table=content.find(i=>'str'in i&&i.str==='Désignation');assert.ok(note&&table&&'transform'in note&&'transform'in table&&note.transform[5]>table.transform[5]);
 }finally{await task.destroy()}
});

test('les hallucinations de sous-titrage isolées ne deviennent pas des commandes métier',()=>{
 assert.equal(isTranscriptionArtifact('Sous-titrage Société Radio-Canada'),true);
 assert.equal(isTranscriptionArtifact('Crée un devis pour Société Radio-Canada, peinture 12 m².'),false);
});

test('une franchise à récupérer dans la source reste due et une déduction niée ne devient pas un poste négatif',()=>{
 for(const source of ['Franchise à récupérer auprès du client : 135 € TTC.', 'Ne déduis pas une franchise de 135 € TTC.']){
 const [quote]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Test',items:[{label:'Peinture',quantity:1,unit:'U',unit_price:100,price_evidence:'100 euros HT'}]}}]},quoteSourceRequest('',`Peinture 1 unité à 100 euros HT. TVA 10 %. ${source}`));
 assert.ok(!(quote.payload.items as {label:string}[]).some(line=>/^franchise/iu.test(line.label)));
 }
});

test('API authentifiée : les lignes copiées atteignent le modèle et le devis préparé utilise le vrai client sans doublon',async()=>{
 const {POST}=await import('../app/api/actions/plan/route');
 const {authenticatedRoute}=await import('./helpers/authenticated-route');
 const priorFetch=globalThis.fetch, priorKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='fixture-key';let insertCount=0;
 const org='11111111-1111-4111-8111-111111111111';
 globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url.includes('/customers')){assert.equal(new URL(url).searchParams.get('organization_id'),`eq.${org}`);return Response.json([client]);}
  if(url.includes('/quotes'))return Response.json([]);
  if(url.includes('api.deepseek.com')){
   const body=JSON.parse(String(init?.body));assert.match(body.messages[1].content,/Mehl Emeric/);assert.match(body.messages[1].content,/42\.08 m2 à 22\.50 euros\n11 rouleaux à 27 euros/);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({actions:[{intent_type:'create_customer',payload:{kind:'business'}},{intent_type:'prepare_quote',payload:{customer_hint:'M. Mel Emric',customer_from_position:0,items:[{label:'Papier peint',unit:'m²',quantity:42.08,quantity_evidence:'42.08 m2',unit_price:22.5,price_evidence:'22.50 euros'}]}}]})}}]});
  }
  if(url.includes('/action_proposals')){insertCount++;const payload=JSON.parse(String(init?.body));return Response.json({...payload,id:`proposal-${insertCount}`});}
  throw new Error(`Unexpected request: ${new URL(url).pathname}`);
 };
 try{
  const response=await authenticatedRoute(POST)(new Request('http://localhost/api/actions/plan',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'dossier-fixture'},body:JSON.stringify({organizationId:org,target:'command',quoteSources:true,sourceTarget:'quote',transcript:quoteSourceRequest('Devis pour M. Mel Emric qui est déjà dans la base.','Papier peint\n42.08 m2 à 22.50\n11rx à 27')})}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const result=await response.json();assert.equal(insertCount,1);assert.equal(result.proposals[0].payload.customer_id,client.id);assert.equal(result.proposals[0].status,'ready');assert.equal(result.proposals[0].payload.items[0].unit_price,22.5);
 }finally{globalThis.fetch=priorFetch;if(priorKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=priorKey;}
});
