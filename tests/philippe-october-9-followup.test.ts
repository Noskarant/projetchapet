import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {normalizeModelPlan} from '../lib/action-planner';
import {quoteSourceRequest} from '../lib/quote-sources';
import {requestedBillTo} from '../lib/document-parties';
import {resolveVoicePlanCustomers} from '../lib/voice-plan-customers';
import {insuranceDocumentNotes} from '../lib/document-insurance';
import {sourceWorkItems} from '../lib/source-work-scope';
import {readClipboardNote, insertCopiedText} from '../lib/quote-source-clipboard';
import {readQuoteSources} from '../lib/quote-source-reader';
import {validateQuoteSources} from '../lib/quote-source-validation';

const note=`ROYER Huguette sin
Chambre étage
Mur
Remplacement de papier peint
42.08 m2 à 22.50
Fournitures, papier peint, 11rx à 27
Placard, rez-de-chaussée, mur et petit plafond, partie haute, préparation, mise en peinture à deux couches, valeur 1 m² à 22,30€ hors-taxes
TVA à 10 %
On rajoute un RSE de 1 %
Et on déduit une franchise de 135 € TTC`;
const context=`Assureur : MAIF
Numéro de dossier : M260809345P
Numéro de mission : R2600100612
Référence entreprise intervenante : 071747R
Coordonnées assuré : ROYER HUGUETTE
Téléphone assuré : 0630209909
Adresse du sinistre : 31 ROUTE DU DURET, 42330 AVEIZIEUX
Franchise à récupérer : 135 €
Descriptif de mission (contexte) : Cuisine, intérieur placard encastré, plafond et murs tachés. Chambre étage, mur tapissé.
Photo de contexte : dommages au plafond.`;
const dossier=()=>quoteSourceRequest('',`Début de la note artisan :\n${note}\nFin de la note artisan\n\n${context}`);
const backend={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})})})} as unknown as SupabaseClient;
const model=()=>({actions:[
 {intent_type:'create_customer',payload:{kind:'individual',last_name:'ROYER',first_name:'HUGUETTE',phones:['0630209909'],addresses:[{line1:'31 ROUTE DU DURET',postal_code:'42330',city:'AVEIZIEUX'}]}},
 {intent_type:'prepare_quote',payload:{customer_hint:'ROYER HUGUETTE',customer_from_position:0,insurance:{case_reference:'071747R',mission_reference:'R260010061'},notes:'Assureur : MAIF. Numéro de mission : R260010061. Numéro de dossier : 071747R. Accès par la cour.',items:[
 {label:'Remplacement de papier peint',scope_evidence:'Remplacement de papier peint',quantity:42.08,quantity_evidence:'42.08 m2',unit:'m²',unit_price:22.5,price_evidence:'22.50 euros'},
 {label:'Fournitures papier peint',scope_evidence:'Fournitures, papier peint',quantity:11,quantity_evidence:'11 rouleaux',unit:'rouleaux',unit_price:27,price_evidence:'27 euros'},
 {label:'Placard, préparation et peinture deux couches',scope_evidence:'Placard, rez-de-chaussée',quantity:1,quantity_evidence:'1 m²',unit:'m²',unit_price:22.3,price_evidence:'22,30€ hors-taxes'},
 {label:'Réparation de plafond cuisine',scope_evidence:'Cuisine, intérieur placard encastré, plafond et murs tachés',quantity:null,unit_price:null},
 {label:'Cloison placo',scope_evidence:'Photo de contexte : dommages au plafond',quantity:1,unit:'U',unit_price:null},
 ]}},
]});

test('le vrai dossier ROYER garde l’assurée, ses coordonnées, les 3 postes demandés et le RSE chiffré',async()=>{
 const transcript=dossier();
 assert.equal(requestedBillTo(transcript),'ROYER HUGUETTE');
 const actions=normalizeModelPlan(model(),transcript);
 await resolveVoicePlanCustomers(actions,'org',backend);
 assert.equal(actions.length,2);assert.equal(actions[1].customerFromPosition,0);
 assert.deepEqual(actions[0].payload.phones,['0630209909']);
 assert.equal((actions[0].payload.addresses as {line1:string}[])[0].line1,'31 ROUTE DU DURET');
 const items=actions[1].payload.items as {label:string;unit_price:number;quantity:number}[];
 assert.equal(items.length,5);assert.deepEqual(items.map(i=>i.unit_price),[22.5,27,22.3,12.66,-122.73]);
 assert.ok(!items.some(i=>/cloison|cuisine/iu.test(i.label)));
 const notes=String(actions[1].payload.notes);
 assert.match(notes,/Numéro de dossier : M260809345P/);assert.match(notes,/Référence mission : R2600100612/);
 assert.doesNotMatch(notes,/071747R/);assert.equal((notes.match(/M260809345P/g)||[]).length,1);assert.match(notes,/Accès par la cour/);
});

test('une consigne de génération générique n’est jamais un nom de client',async()=>{
 for(const instructions of ['', 'Créer un devis pour les travaux décrits dans les sources.']) {
  const actions=normalizeModelPlan(model(),quoteSourceRequest(instructions,context));
  await resolveVoicePlanCustomers(actions,'org',backend);
  assert.equal(actions.length,2);assert.equal(actions[1].payload.customer_hint,'ROYER HUGUETTE');assert.equal(actions[1].customerFromPosition,0);
 }
 const actions=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'les travaux décrits dans les sources',items:[{label:'Peinture'}]}}]},quoteSourceRequest('','Peinture de mur.'));
 await resolveVoicePlanCustomers(actions,'org',backend);
 assert.equal(actions.length,1);assert.ok(actions[0].missingFields.includes('client_a_confirmer'));
});

test('le périmètre conserve les postes sans prix et les demandes explicites d’ajout',()=>{
 const raw=[{label:'Peinture',scope_evidence:'Chambre étage'},{label:'Autre poste sans annotation'},{label:'Réparation',scope_evidence:'Photo de contexte : dommages au plafond'}];
 assert.equal(sourceWorkItems(raw,dossier()).length,2);
 assert.equal(sourceWorkItems(raw,quoteSourceRequest('Ajoute les travaux demandés par la mission.',`Début de la note artisan :\n${note}\nFin de la note artisan\n${context}`)).length,3);
 assert.equal(sourceWorkItems(raw,quoteSourceRequest('',context)).length,3);
});

test('les références absentes du payload sont récupérées et deux dossiers contradictoires ne sont pas devinés',()=>{
 assert.match(insuranceDocumentNotes('',{},context),/M260809345P/);
 const ambiguous=insuranceDocumentNotes('Numéro de dossier : M260809345P.',{case_reference:'M260809345P'},`${context}\nNuméro de dossier : M260809346P`);
 assert.doesNotMatch(ambiguous,/Numéro de dossier/);
 assert.equal(requestedBillTo(quoteSourceRequest('',`${context}\nCoordonnées assuré : DURAND PAUL`)),'');
 assert.equal(requestedBillTo(quoteSourceRequest('Devis pour Agence Citya.',context)),'Agence Citya');
});

test('le collage associe texte et image, respecte la sélection et garde le repli texte',async()=>{
 const clipboard={read:async()=>[{types:['text/plain','image/png'],getType:async(type:string)=>new Blob([type==='text/plain'?note:'image-bytes'],{type})}],readText:async()=>''} as unknown as Clipboard;
 const result=await readClipboardNote(clipboard);
 assert.equal(result.text,note);assert.equal(result.files.length,1);assert.equal(result.files[0].type,'image/png');
 assert.equal(insertCopiedText('Avant ANCIEN après',result.text,6,12),`Avant ${note} après`);
 assert.throws(()=>insertCopiedText('a'.repeat(10_000),'x',0,0),/trop long/);
 const fallback=await readClipboardNote({read:async()=>{throw new Error('unavailable')},readText:async()=>note} as unknown as Clipboard);
 assert.equal(fallback.text,note);
});

test('12 pages sont lues intégralement dans l’ordre, avec au plus deux requêtes vision simultanées',async()=>{
 const priorFetch=globalThis.fetch, priorKey=process.env.GROQ_API_KEY;
 process.env.GROQ_API_KEY='fixture';let active=0,maxActive=0,calls=0;
 globalThis.fetch=async(_input,init)=>{
  const body=JSON.parse(String(init?.body));const index=++calls;active++;maxActive=Math.max(maxActive,active);
  assert.equal(body.messages[1].content.filter((c:{type:string})=>c.type==='image_url').length,3);
  assert.match(body.messages[0].content,/type et le rôle de chaque source/);assert.match(body.messages[0].content,/Coordonnées assuré/);
  await new Promise(resolve=>setTimeout(resolve,index%2?15:1));active--;
  return Response.json({choices:[{message:{content:`groupe-${index}`},finish_reason:'stop'}]});
 };
 try {
  const sources=validateQuoteSources(Array.from({length:12},(_,i)=>({name:`page-${i}`,image:'data:image/jpeg;base64,/9j/AA=='})));
  assert.equal(await readQuoteSources(sources),'groupe-1\n\ngroupe-2\n\ngroupe-3\n\ngroupe-4');assert.equal(calls,4);assert.equal(maxActive,2);
  assert.throws(()=>validateQuoteSources([...sources,sources[0]]),/1 à 12/);
  assert.throws(()=>validateQuoteSources(sources.map(source=>({...source,image:'data:image/jpeg;base64,/9j/'+ 'A'.repeat(399_976)}))),/volumineux/);
 }finally{globalThis.fetch=priorFetch;if(priorKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=priorKey;}
});


test('si le modèle oublie la fiche, le seul assuré identifié conserve son téléphone et son adresse sans civilité inventée', async()=>{
 const actions=normalizeModelPlan({actions:[model().actions[1]]},quoteSourceRequest('',context));
 actions[0].customerFromPosition=undefined;
 await resolveVoicePlanCustomers(actions,'org',backend);
 assert.equal(actions.length,2);assert.equal(actions[1].payload.kind,'individual');assert.equal(actions[1].payload.civility,null);
 assert.deepEqual(actions[1].payload.phones,['0630209909']);
 assert.deepEqual((actions[1].payload.addresses as Record<string,unknown>[])[0],{label:'Principale',line1:'31 ROUTE DU DURET',line2:'',postal_code:'42330',city:'AVEIZIEUX',country:'France'});
});
