import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { plannedActionFromParsed, normalizeModelPlan, fallbackCommandPlan } from '../lib/action-planner';
import { riskLevelForIntent } from '../lib/action-engine';
import { createSupplierFromVoice } from '../lib/voice-supplier';

test('le fournisseur dicté normalise les coordonnées et reste soumis à validation',()=>{
 const action=plannedActionFromParsed('supplier',{name:' Tollens ',contact:' Julie ',email:'julie arobase tollens point fr',phone:'04 00 00 00 00',address:'12 rue Centrale',notes:'Livraison le matin'},'Crée le fournisseur Tollens, julie arobase tollens point fr');
 assert.equal(action.intentType,'create_supplier');assert.equal(action.status,'ready');assert.equal(action.riskLevel,'review');assert.equal(action.payload.email,'julie@tollens.fr');assert.equal(action.payload.contact,'Julie');assert.equal(action.payload.address,'12 rue Centrale');
});
test('le nom suffit et les coordonnées absentes restent vides',()=>{
 const action=plannedActionFromParsed('supplier',{name:'Tollens'},'Crée le fournisseur Tollens');assert.equal(action.status,'ready');assert.equal(action.payload.email,'');assert.equal(action.payload.phone,'');assert.equal(riskLevelForIntent('create_supplier'),'review');
});
test('le nom manquant et l’adresse e-mail incorrecte empêchent la création',()=>{
 assert.deepEqual(plannedActionFromParsed('supplier',{},'Crée un fournisseur').missingFields,['nom_fournisseur']);
 const action=plannedActionFromParsed('supplier',{name:'Tollens',email:'julie-tollens.fr'},'Crée Tollens');assert.equal(action.status,'needs_input');assert(action.missingFields.includes('email_fournisseur_invalide'));
});
test('une dictée mixte conserve fournisseur, client, devis et agenda',()=>{
 const actions=normalizeModelPlan({actions:[{intent_type:'create_supplier',payload:{name:'Tollens'},missing_fields:['email']},{intent_type:'create_customer',payload:{kind:'business',company_name:'Dupont'}},{intent_type:'prepare_quote',payload:{customer_from_position:1,items:[{label:'Peinture',quantity:10,unit_price:20,tax_rate:10}]}},{intent_type:'schedule_task',payload:{title:'Visite Dupont',date:'2026-10-01',time:'09:00'}}]},'Crée Tollens et Dupont, devis peinture 10 m² à 20 euros HT TVA 10%, visite le 1 octobre à 9 heures');
 assert.deepEqual(actions.map(a=>a.intentType),['create_supplier','create_customer','prepare_quote','schedule_task']);assert.equal(actions[0].status,'ready');
});
test('sans modèle, une création fournisseur ne devient pas une note chantier',()=>{
 const action=fallbackCommandPlan('Crée un fournisseur Tollens avec son contact Julie')[0];assert.equal(action.intentType,'create_supplier');assert.equal(action.status,'needs_input');
});
function fakeClient(records:Array<{id:string;payload:Record<string,unknown>}>){
 const writes:Record<string,unknown>[]=[];
 const client={from:(table:string)=>{assert.equal(table,'artisan_workflow_records');return{select:()=>{const query={eq:()=>query,then:(resolve:(v:unknown)=>void)=>Promise.resolve({data:records,error:null}).then(resolve)};return query;},upsert:async(row:Record<string,unknown>,options:unknown)=>{assert.deepEqual(options,{onConflict:'organization_id,kind,id',ignoreDuplicates:true});writes.push(row);return{error:null};}};}} as unknown as SupabaseClient;
 return{client,writes};
}
test('la création persiste dans la fiche fournisseur de l’entreprise sans envoi e-mail',async()=>{
 const{client,writes}=fakeClient([]);const result=await createSupplierFromVoice(client,'org-1','proposal-1',{name:'Tollens',email:'julie@tollens.fr',contact:'Julie'});assert.equal(result.id,'voice-proposal-1');assert.equal(writes.length,1);assert.equal(writes[0].organization_id,'org-1');assert.equal(writes[0].kind,'supplier');assert.equal((writes[0].payload as Record<string,unknown>).email,'julie@tollens.fr');
});
test('un nouvel essai conserve une fiche déjà créée, même si elle a été modifiée',async()=>{
 const{client,writes}=fakeClient([{id:'voice-proposal-1',payload:{name:'Tollens Lyon'}}]);const result=await createSupplierFromVoice(client,'org-1','proposal-1',{name:'Tollens'});assert.equal(result.name,'Tollens Lyon');assert.equal(result.duplicate,true);assert.equal(writes.length,0);
});
test('un fournisseur déjà enregistré n’est pas dupliqué par une autre dictée',async()=>{
 const{client,writes}=fakeClient([{id:'manual',payload:{name:'TOLLENS',email:'julie@tollens.fr'}}]);await assert.rejects(createSupplierFromVoice(client,'org-1','proposal-2',{name:'Tollens'}),/existe déjà/);assert.equal(writes.length,0);
});
