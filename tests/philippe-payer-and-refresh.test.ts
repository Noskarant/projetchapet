import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {normalizeModelPlan} from '../lib/action-planner';
import {resolveVoicePlanCustomers,billToCustomerMatches} from '../lib/voice-plan-customers';
import {customerSourceRequest} from '../lib/quote-sources';
import {normalizeVoiceTranscript} from '../lib/voice-facts';
import {seedMobileWorkspace} from '../lib/mobile-prototype';
import {preservePendingWorkspaceChanges} from '../lib/mobile-desktop-sync';
import {persistMobileWorkspace,MOBILE_WORKSPACE_STORAGE_KEY} from '../lib/mobile-workspace-storage';

const payer={id:'payer-id',kind:'business',company_name:'CITYA MONTCHALIN',emails:['agence@example.fr'],phones:['0477494400'],addresses:[{line1:'2 rue de la République',postal_code:'42000',city:'Saint-Étienne'}]};
function client(customers:Record<string,unknown>[]){const chain={select(){return this},eq(){return this},async limit(){return {data:customers,error:null}}};return {from(){return chain}} as unknown as SupabaseClient;}
const text='On va faire un devis pour Cytia-Montchalin, 2 rue de la République à Saint-Etienne. Suite remplacement de colonne sur un appartement au 16 boulevard Karl Marx, 42100 Saint-Etienne, occupé par monsieur Crozier. Son téléphone 07 67 94 42 52. Remise en état de son appartement. Peinture une unité 570 euros HT, TVA 10 %. RSE 1 %.';

test('un payeur explicite existant prime sur l’occupant et garde ses propres coordonnées',async()=>{
 const actions=normalizeModelPlan({actions:[{intent_type:'create_customer',payload:{kind:'individual',company_name:'Cytia-Montchalin',last_name:'Crozier',phones:['0767944252'],addresses:[{line1:'16 boulevard Karl Marx'}]}},{intent_type:'prepare_quote',payload:{customer_from_position:0,notes:'Remise en état',items:[{label:'Peinture',quantity:1,unit:'U',unit_price:570,tax_rate:10}]}}]},text);
 await resolveVoicePlanCustomers(actions,'org',client([payer,{id:'occupant',kind:'individual',last_name:'Crozier'}]));
 assert.equal(actions[0].payload.existing_customer_id,payer.id);assert.equal(actions[0].payload.kind,'business');
 assert.deepEqual(actions[0].payload.phones,payer.phones);assert.equal((actions[0].payload.addresses as {line1:string}[])[0].line1,'2 rue de la République');
 assert.equal(actions[1].payload.customer_id,payer.id);assert.equal(actions[1].customerFromPosition,undefined);
 assert.match(String(actions[1].payload.notes),/Lieu d’intervention : 16 boulevard Karl Marx/);assert.match(String(actions[1].payload.notes),/Occupant : monsieur Crozier/);
});
test('une demande importée désigne le client facturé sans transformer l’agence en assuré',async()=>{
 const transcript=customerSourceRequest('', 'Demande de devis. Client facturé : CITYA MONTCHALIN\nAdresse du client facturé : 2 rue de la République\nLieu d’intervention : 16 boulevard Karl Marx\nOccupant : M. Crozier');
 for(const input of [transcript,normalizeVoiceTranscript(transcript)]){
  const actions=normalizeModelPlan({actions:[{intent_type:'create_customer',payload:{kind:'individual',last_name:'Crozier',phones:['0767944252']}}]},input);
  await resolveVoicePlanCustomers(actions,'org',client([payer]));assert.equal(actions[0].payload.existing_customer_id,payer.id);assert.deepEqual(actions[0].payload.phones,payer.phones);
 }
});
test('deux agences proches restent ambiguës au lieu de choisir un client arbitrairement',()=>{
 assert.equal(billToCustomerMatches([payer,{...payer,id:'second',company_name:'CITYA MONCHALIN'}],'Cytia Montchalin').length,2);
});
test('la TVA et la remise en état ne déclenchent ni réduction ni mention financière inventée',()=>{
 for(const input of ['Remise en état du mur, TVA 10 %.','Remise en état du mur. Le prix de la vente est de 10 %.']){
  const [action]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Agence',discount_percent:10,notes:'Remise en état du mur. Remise globale de 10 % et majoration RSE de 1 %.',items:[{label:'Mur',quantity:1,unit:'U',unit_price:100}]}}]},input);
  assert.equal(action.payload.discount_percent,0);assert.doesNotMatch(String(action.payload.notes),/Remise globale/);assert.match(String(action.payload.notes),/Remise en état/);
 }
 const [explicit]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{discount_percent:10,items:[]}}]},'TVA 10 %, remise de 4 %.');assert.equal(explicit.payload.discount_percent,4);
 const [negative]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{discount_percent:10,items:[]}}]},'Pas de remise de 10 %, TVA 10 %.');assert.equal(negative.payload.discount_percent,0);
});
test('une saisie et un devis ajoutés pendant la synchronisation restent visibles avec les numéros serveur',()=>{
 const start=seedMobileWorkspace(),base=start.quotes[0];
 const current={...start,quotes:[{...base,title:'Modification pendant l’envoi'},...start.quotes.slice(1),{...base,id:'new-local',number:'D-local',title:'Nouveau devis manuel'}]};
 const server={...start,quotes:start.quotes.map(quote=>quote.id===base.id?{...quote,number:'DEV-2026-999',notes:'Note reçue du serveur'}:quote)};
 const result=preservePendingWorkspaceChanges(start,current,server);
 assert.equal(result.quotes[0].number,'DEV-2026-999');assert.equal(result.quotes[0].title,'Modification pendant l’envoi');assert.equal(result.quotes[0].notes,'Note reçue du serveur');assert.equal(result.quotes.at(-1)?.id,'new-local');
 const deleted=preservePendingWorkspaceChanges(start,{...start,quotes:start.quotes.slice(1)},server);assert.ok(!deleted.quotes.some(quote=>quote.id===base.id));
});
test('la liste est notifiée sur la même page après la sauvegarde du snapshot et reçoit les nouveaux IDs',()=>{
 const events=new EventTarget(),workspace=seedMobileWorkspace();let raw='',seen=false;
 events.addEventListener('manufeo:local-workspace-updated',event=>{seen=true;assert.equal(raw,JSON.stringify(workspace));assert.deepEqual((event as CustomEvent).detail,{quotes:{local:'canonical'}});});
 persistMobileWorkspace({setItem(key,value){assert.equal(key,MOBILE_WORKSPACE_STORAGE_KEY);raw=value;}},workspace,events,{quotes:{local:'canonical'}});assert.equal(seen,true);
});
