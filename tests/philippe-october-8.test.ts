import test from 'node:test';
import assert from 'node:assert/strict';
import { documentUnit } from '../lib/document-units';
import { customerSourceRequest, quoteSourceRequest, sourceRequestTarget } from '../lib/quote-sources';
import { normalizeModelPlan } from '../lib/action-planner';
import { normalizeVoiceTranscript } from '../lib/voice-facts';
import { spokenDiscount } from '../lib/percentage-adjustments';
import { calculateQuotePreviewTotals } from '../lib/mobile-quote-preview';
import { restrictSourcePlan } from '../lib/source-plan';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { seedMobileWorkspace, type LineItem } from '../lib/mobile-prototype';

const note = 'WARAMBOURG Jacqueline\n155, rue Bergson\n06 14 32 66 85\nassurance Maif\nSous dégât des eaux\nDossier sec réparé\nSalle de bain\nPlafond\nPréparation mise en peinture mat à deux couches\nForfait 1376 € hors-taxes TVA à 10 %\nRSE, 1 % du montant total\nRemise 4 %';
function quotePlan(observations = note) {
  return normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint:'Mme WARAMBOURG Jacqueline', notes:'Dossier sec réparé', items:[{label:'Salle de bain, plafond',description:'Préparation et mise en peinture mate à deux couches',quantity:1,unit:'forfait',unit_price:1376,price_type:'ht',price_evidence:'1376 € hors-taxes',tax_rate:10,tax_evidence:'TVA à 10 %'}] } }] }, normalizeVoiceTranscript(quoteSourceRequest('Génère un devis', observations)))[0];
}
const lines = (action: ReturnType<typeof quotePlan>): LineItem[] => (action.payload.items as Array<Record<string,unknown>>).map((item,index)=>({id:String(index),label:String(item.label),description:String(item.description||''),quantity:item.quantity as number|null,unit:item.unit as string|null,unitPrice:item.unit_price as number|null,taxRate:item.tax_rate as number|null}));

test('note de Philippe : RSE avec virgule calculée et remise 4 % réellement appliquée',()=>{
 const action=quotePlan();const items=lines(action);
 assert.equal(items.length,2);assert.equal(items[0].unitPrice,1376);assert.equal(items[0].unit,'forfait');
 assert.equal(items[1].unitPrice,13.76);assert.equal(items[1].taxRate,10);assert.equal(action.payload.discount_percent,4);
 assert.deepEqual(calculateQuotePreviewTotals(items,4),{grossSubtotal:1389.76,discountPercent:4,discountAmount:55.59,subtotal:1334.17,taxTotal:133.42,total:1467.59});
});

test('OCR : pourcentages ponctués ou reformulés, sans inventer une remise absente',()=>{
 for(const separator of [',',':',';','=','\n']) {
  const action=quotePlan(note.replace('RSE,',`RSE${separator}`).replace('Remise 4 %',`Remise accordée${separator} 4 %`));
  assert.equal(lines(action)[1].unitPrice,13.76);assert.equal(action.payload.discount_percent,4);
 }
 assert.equal(spokenDiscount('Remise de quatre pour cent'),4);
 assert.equal(spokenDiscount('Remise à préciser'),null);
 assert.equal(spokenDiscount('Remise 104 %'),null);
 assert.equal(quotePlan(note.replace('Remise 4 %','')).payload.discount_percent,0);
});

test('mode IA avec capture : la demande client prend la bonne route sans créer un devis',()=>{
 for(const request of ['Crée un client','Créer une fiche client','Ajoute ce client','Enregistre un contact']) assert.equal(sourceRequestTarget('command',request),'customer');
 assert.equal(sourceRequestTarget('quote','Crée un client depuis cette capture'),'customer');
 assert.equal(sourceRequestTarget('command','Crée un client et un devis'),'quote');
 assert.equal(sourceRequestTarget('command','Génère un devis'),'quote');
 assert.equal(sourceRequestTarget('customer',''),'customer');
 const observations='Assureur MAIF. Entreprise intervenante SARL CHAPET PERE ET FILS. Référence mission R2600100705. Adresse du sinistre : 6 RUE MICHELET, 42000 ST ETIENNE. Coordonnées assuré : PIN PAULINE, 42000 ST ETIENNE, 0634637624. Franchise à récupérer : Non renseignée.';
 const transcript=customerSourceRequest('Crée un client',observations);
 const plan=restrictSourcePlan(normalizeModelPlan({actions:[{intent_type:'create_customer',payload:{kind:'individual',last_name:'PIN',first_name:'PAULINE',phones:['0634637624'],addresses:[{line1:'6 RUE MICHELET',postal_code:'42000',city:'ST ETIENNE'}],insurance:{insurer:'MAIF',mission_reference:'R2600100705'}}},{intent_type:'prepare_quote',payload:{customer_from_position:0,items:[]}}]},transcript),'customer');
 assert.equal(plan.length,1);assert.equal(plan[0].status,'ready');assert.equal(plan[0].payload.last_name,'PIN');
 assert.deepEqual(plan[0].payload.phones,['0634637624']);assert.match(String(plan[0].payload.notes),/R2600100705/);
});

test('unités métier : abréviations sans transformer les forfaits, longueurs ou unités inconnues',()=>{
 for(const [input,expected] of [['mètre carré','m²'],['mètres carrés','m²'],['m2','m²'],['m²','m²'],['mètres linéaires','Ml'],['ml','Ml'],['unité','U'],['u.','U'],['heures','h'],['forfait','forfait'],['mètre','mètre'],['rouleaux','rouleaux']]) assert.equal(documentUnit(input),expected);
 assert.equal(documentUnit(null),null);
});

test('PDF issu de la note : RSE, remise et total calculés sont visibles ; unités longues abrégées',async()=>{
 const action=quotePlan();const items=lines(action);items.push({id:'free',label:'Protection offerte',description:'',quantity:1,unit:'mètre carré',unitPrice:0,taxRate:10});
 const state=seedMobileWorkspace();const totals=calculateQuotePreviewTotals(items,4);
 const quote={...state.quotes[0],title:'Salle de bain',items,notes:'Dossier sec réparé',...totals};
 const blob=await buildBusinessDocumentPdf({document:quote,company:{displayName:'Entreprise test'},customer:state.customers[0],profile:null,quoteMeta:{discountPercent:4,internalNotes:""}});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 try {const pdf=await task.promise;let text='';for(let i=1;i<=pdf.numPages;i++) text+=(await(await pdf.getPage(i)).getTextContent()).items.flatMap(item=>'str'in item?[item.str]:[]).join(' ');
 assert.match(text,/RSE \(1 %\)/);assert.match(text,/Remise.*4 %/);assert.match(text,/1 467,59/);assert.doesNotMatch(text,/mètre carré/);
 }finally{await task.destroy()}
});

test('API import client : intention imposée au planificateur et seule la fiche assuré est enregistrée', async()=>{
 const {POST}=await import('../app/api/actions/plan/route');const {authenticatedRoute}=await import('./helpers/authenticated-route');
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='local-test-key';
 const persisted:Array<Record<string,unknown>>=[];
 globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url==='https://api.deepseek.com/chat/completions') {
   const body=JSON.parse(String(init?.body));assert.match(body.messages[0].content,/retourne uniquement create_customer/);assert.match(body.messages[0].content,/Coordonnées assuré/);
   return Response.json({choices:[{message:{content:JSON.stringify({actions:[{intent_type:'create_customer',payload:{kind:'individual',last_name:'PIN',first_name:'PAULINE',phones:['0634637624']}},{intent_type:'prepare_quote',payload:{customer_from_position:0,items:[]}},{intent_type:'prepare_email',payload:{to:'other@example.fr',subject:'Ne pas créer'}}]})}}]});
  }
  if(url.includes('/customers')) return Response.json([]);
  if(url.includes('/action_proposals')) {const row=JSON.parse(String(init?.body));persisted.push(row);return Response.json({id:'source-customer',...row});}
  throw new Error(`Unexpected endpoint ${url}`);
 };
 try{
  const response=await authenticatedRoute(POST)(new Request('https://manufeo.test/api/actions/plan',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'oct8-source-client'},body:JSON.stringify({organizationId:'11111111-1111-4111-8111-111111111111',target:'customer',sourceTarget:'customer',transcript:customerSourceRequest('Crée un client','Coordonnées assuré : PIN PAULINE. 0634637624.')} )}));
  assert.equal(response.status,200);assert.equal(persisted.length,1);assert.equal(persisted[0].intent_type,'create_customer');assert.equal(persisted[0].status,'ready');
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});
