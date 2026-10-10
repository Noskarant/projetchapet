import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceDocuments,reconcileSourceReadings,sourceDocumentObservations,sourceDocumentsFromTranscript,canonicalSourceRows,sourceNumber} from '../lib/source-document-integrity';
import {readQuoteSources} from '../lib/quote-source-reader';
import {quoteSourceRequest} from '../lib/quote-sources';
import {normalizeModelPlan,plannedActionFromParsed} from '../lib/action-planner';
import {hardenPlannedActions} from '../lib/action-plan-safety';
import {calculateTotals,seedMobileWorkspace} from '../lib/mobile-prototype';
import {documentLinePresentation} from '../lib/document-line-presentation';
import {buildBusinessDocumentPdf} from '../lib/mobile-document-pdf';
import {executeProposalBatch} from '../lib/action-execution-server';
import {proposeLearnedSellingPrices} from '../lib/learned-selling-prices-server';

// Manually transcribed from Philippe's photo, not an asserted live OCR result.
const description = 'Fourniture et pose d’un caisson pour cacher chaudière à gaz avec une grille de ventilation en aluminium brossé de modèle carré fixé en partie haute de la porte, il sera muni d’une porte fixée sur charnières invisibles avec amortisseur avec une rosace encastrée en aluminium pour le tirage de la porte d’une dimension de 1.20 m h x 0.50 m p x 0.80 l';
const tuples: Array<[string,string,string,number,string,number,number]> = [
 ['Hall','Plafond','Dépose et évacuation du plafond en dalles, y compris taxes décharge publique, fourniture et pose d’un nouveau plafond en placo plâtre BA13 sur ossatures R48 M48',4.32,'m²',90,388.8],
 ['Hall','Spots LED','Dépose, évacuation, fourniture et pose de 3 nouveaux spots led',3,'U',70,210],
 ['Hall','Plafond','Impression, préparation et mise en peinture mate à 2 couches',4.32,'m²',29,125.28],
 ['Hall','Murs et tuyaux','Préparation et mise en peinture à 2 couches',19.03,'m²',23,437.69],
 ['Hall','Sol','Ponçage et vitrification à 3 couches',4.32,'m²',32,138.24],
 ['Hall','Caisson chaudière',description,1,'U',500,500],
 ['Pièce de vie','Plafond','Préparation et mise en peinture mate à 2 couches',37.85,'m²',24,908.4],
 ['Pièce de vie','Murs','Préparation et mise en peinture à 2 couches',70.16,'m²',23,1613.68],
 ['Pièce de vie','Boiseries (sur 1 face)','Préparation et mise en peinture à 2 couches',11.53,'m²',27,311.31],
 ['Pièce de vie','Seuil','Fourniture et pose d’un seuil en tôle 2mm y compris ragréage pour compensation',1,'U',200,200],
];
const source = () => ({source_index:0,kind:'estimate',reference:'2022506',observations:'Client : Madame LETIEVANT. 2 impasse Soleilhac, 42000 SAINT ETIENNE. Téléphone : 06 48 78 68 83. E-mail : myletievant@laposte.net. Objet : rénovation de votre maison.',unit_price_type:'ht',line_total_type:'ht',tax_column:'code',rows_complete:true,subtotal:null as number|null,subtotal_scope:'unknown',rows:tuples.map(([location,label,description,quantity,unit,unit_price,line_total])=>({location,label,description,quantity,unit,unit_price,line_total,tax_rate:null as number|null,tax_code:'4',uncertain_fields:[] as string[]}))});
const expected=[{id:'image-0',name:'photo.jpeg'}];
const parse=(doc=source())=>parseSourceDocuments({sources:[doc]},expected);
const transcript=(docs=parse(),instructions='')=>quoteSourceRequest(instructions,sourceDocumentObservations(docs));
const plan=(text=transcript(),items:unknown[]=[{label:'poste inventé',quantity:999,unit_price:999,tax_rate:20}])=>hardenPlannedActions(normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'LETIEVANT',items}}]},text))[0];
const items=(action=plan())=>action.payload.items as Array<{label:string;description:string;quantity:number|null;unit:string|null;unit_price:number|null;tax_rate:number|null;source_row_id:string}>;
const totals=(lines=items())=>calculateTotals(lines.map((row,index)=>({id:String(index),label:row.label,description:row.description,quantity:row.quantity,unit:row.unit,unitPrice:row.unit_price,taxRate:row.tax_rate})));

test('photo LETIEVANT : dix postes sources, aucun doublon, chiffres exacts et description complète malgré un plan incorrect',()=>{
 const action=plan(), rows=items(action);
 assert.equal(rows.length,10); assert.deepEqual(rows.map(r=>[r.quantity,r.unit_price]),tuples.map(t=>[t[3],t[5]]));
 assert.equal(rows[0].description,tuples[0][2]); assert.equal(rows[5].description,description);
 assert.deepEqual(totals(rows),{subtotal:4833.4,taxTotal:483.34,total:5316.74});
 assert.match(action.warnings.join(' '),/code TVA ne permet pas/);assert.match(action.warnings.join(' '),/par défaut/);
 assert.deepEqual(documentLinePresentation(rows[0]),{title:'Hall',description:tuples[0][2]});
 assert.equal(items(plannedActionFromParsed('quote',{customer_hint:'Test',items:[]},transcript())).length,10);
});
test('relecture : 78,16 × 20 incohérent est remplacé par la lecture 70,16 × 23 qui confirme le total imprimé',()=>{
 const bad=source();bad.rows[7].quantity=78.16;bad.rows[7].unit_price=20;
 const docs=reconcileSourceReadings(parse(bad),parse());assert.equal(items(plan(transcript(docs)))[7].quantity,70.16);assert.equal(totals(items(plan(transcript(docs)))).subtotal,4833.4);
});
test('un poste source lu en deux postes facturés est refusé avant génération',()=>{
 const split=source();split.rows.splice(1,0,{...split.rows[0],label:'Fourniture'});
 assert.throws(()=>reconcileSourceReadings(parse(),parse(split)),/mêmes prestations/);
});
test('deux lectures contradictoires et cohérentes chacune laissent les chiffres vides, sans arbitrage inventé',()=>{
 const other=source();other.rows[7].quantity=78.16;other.rows[7].unit_price=20;other.rows[7].line_total=1563.2;
 const rows=items(plan(transcript(reconcileSourceReadings(parse(),parse(other)))));
 assert.equal(rows[7].quantity,null);assert.equal(rows[7].unit_price,null);assert.equal(rows[6].quantity,37.85);
});
test('un calcul incohérent même répété par les deux lectures ne devient pas un montant certain',()=>{
 const other=source();other.rows[7].quantity=78.16;other.rows[7].unit_price=20;
 const action=plan(transcript(reconcileSourceReadings(parse(other),parse(other))));assert.equal(items(action)[7].unit_price,null);assert.match(action.warnings.join(' '),/Lecture à confirmer/);
});
test('description coupée entre les lectures : pas de perte silencieuse',()=>{
 const cut=source();cut.rows[5].description=description.slice(0,240);
 assert.throws(()=>reconcileSourceReadings(parse(),parse(cut)),/désignation.*incertain/);
});
test('totaux de page contrôlés ; total du document ne vaut pas sous-total de sa dernière page',()=>{
 const doc=source();doc.subtotal=5171.72;doc.subtotal_scope='page';assert.throws(()=>reconcileSourceReadings(parse(doc),parse(doc)),/sous-total/);
 doc.subtotal_scope='document';assert.equal(reconcileSourceReadings(parse(doc),parse(doc)).length,1);
});
test('tax_code 4 ne devient pas 4 % ni un taux prétendument lu',()=>{
 const doc=source();doc.rows.forEach(r=>r.tax_rate=20);assert.ok(parse(doc)[0].rows.every(r=>r.tax_rate===null));
 assert.ok(items(plan(transcript(parse(doc),'TVA 20 % pour tout le devis.'))).every(row=>row.tax_rate===20));
});
test('TTC explicite : conversion unique avec taux connu, jamais avec un taux deviné',()=>{
 const doc=source();doc.rows=doc.rows.slice(0,1);Object.assign(doc.rows[0],{quantity:2,unit_price:110,line_total:220,tax_rate:10});doc.tax_column='rate';doc.unit_price_type='ttc';doc.line_total_type='ttc';
 assert.equal(items(plan(transcript(parse(doc))))[0].unit_price,100);
 doc.rows[0].tax_rate=null;assert.equal(items(plan(transcript(parse(doc))))[0].unit_price,null);
});
test('zéro explicite préservé, HT/TTC absent ne se transforme pas en prix HT certain',()=>{
 const doc=source();doc.rows[0].unit_price=0;doc.rows[0].line_total=0;assert.equal(items(plan(transcript(parse(doc))))[0].unit_price,0);
 doc.unit_price_type='unknown';doc.line_total_type='unknown';assert.equal(items(plan(transcript(parse(doc))))[1].unit_price,null);
});
test('changement explicite par l’artisan et marge appliquée une seule fois après la lecture',()=>{
 const rows=parse()[0].rows;
 const changed=plan(transcript(parse(),'Hall spots LED : 80 euros HT. Quantité 4 unités. TVA 20 % pour tout le devis.'),[{source_row_id:rows[1].id,label:'Hall - Spots LED',unit_price:80,quantity:4,unit:'U',price_evidence:'80 euros HT',quantity_evidence:'4 unités',tax_evidence:'TVA 20 %'}]);
 assert.deepEqual([items(changed)[1].quantity,items(changed)[1].unit_price,items(changed)[1].tax_rate],[4,80,20]);
 assert.equal(items(plan(transcript(parse(),'Majoration commerciale des prix HT : 10 %.')))[0].unit_price,99);
});
test('description de plus de 800 caractères et désignations identiques : chaque poste garde ses détails et son prix',()=>{
 const doc=source();doc.rows[0].description='Dépose et fourniture. '.repeat(50)+'Dimensions 1.20 m x 0.50 m x 0.80 m.';
 const rows=items(plan(transcript(parse(doc))));assert.equal(rows[0].description,doc.rows[0].description);assert.equal(rows[2].description,doc.rows[2].description);assert.equal(rows[2].unit_price,29);
});
test('données JSON incomplètes, tableau tronqué et code injecté sont refusés proprement',()=>{
 const doc=source();doc.rows_complete=false;assert.throws(()=>parse(doc),/prestations.*lisibles/);
 const data=parse();(data[0].rows[0] as unknown as {quantity:string}).quantity='90';assert.throws(()=>sourceDocumentsFromTranscript(transcript(data)),/incomplètes/);
 assert.throws(()=>sourceDocumentsFromTranscript('Début des lignes documentaires contrôlées : {oops Fin des lignes documentaires contrôlées'),/incomplètes/);
});
test('pages distinctes conservées, doublon de page et devis alternatifs rejetés',()=>{
 const one=parse()[0],two={...one,id:'image-1',reference:'2022507',rows:one.rows.map(r=>({...r,id:'image-1-'+r.id}))};
 assert.throws(()=>canonicalSourceRows(transcript([one,two])),/devis distincts/);
 two.reference=one.reference;assert.throws(()=>canonicalSourceRows(transcript([one,two])),/plusieurs fois/);
 two.rows=two.rows.slice(5);assert.equal(canonicalSourceRows(transcript([one,two]))?.length,15);
});
test('contexte seul sans demande de travaux : aucune prestation inventée ; note artisan prioritaire conservée',()=>{
 const doc=parse()[0];doc.kind='context';doc.rows=[];
 assert.throws(()=>plan(transcript([doc])),/contexte/);
 assert.equal(canonicalSourceRows(transcript(parse(),'Début de la note artisan :\nPapier peint\n42.08 m2 à 22.50\nFin de la note artisan')),null);
});
test('numériques OCR : espaces français, virgules, milliers et zéro, sans récupérer des chiffres bancaires',()=>{
 assert.equal(sourceNumber('1 613,68 €'),1613.68);assert.equal(sourceNumber('1.613,68'),1613.68);assert.equal(sourceNumber('70.160'),70.16);assert.equal(sourceNumber(0),0);assert.equal(sourceNumber('FR7614506000'),null);
});
test('tarifs habituels : ne remplacent jamais une valeur absente ou incertaine d’un document repris',async()=>{
 const action=plan();const first=items(action)[0];first.unit_price=null;
 const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:[{id:'old',items:[{label:first.label,unit:first.unit,unit_price:888}]}],error:null})};
 await proposeLearnedSellingPrices([action],'org',{from:()=>query} as unknown as Parameters<typeof proposeLearnedSellingPrices>[2]);
 assert.equal(items(action)[0].unit_price,null);
});
test('vision : deux lectures structurées sans amorçage par les premières valeurs, puis lignes canoniques',async()=>{
 const original=globalThis.fetch,prior=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='fixture';let calls=0;
 globalThis.fetch=async(_input,init)=>{
  const body=JSON.parse(String(init?.body));assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.messages.length,2);
  assert.ok(!JSON.stringify(body.messages[1]).includes('1613.68'));calls++;
  return Response.json({choices:[{message:{content:JSON.stringify({sources:[source()]})},finish_reason:'stop'}]});
 };
 try{const obs=await readQuoteSources([{name:'photo.jpeg',image:'data:image/jpeg;base64,/9j/AA=='}]);assert.equal(calls,2);assert.equal(totals(items(plan(quoteSourceRequest('',obs)))).subtotal,4833.4);}
 finally{globalThis.fetch=original;if(prior===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=prior;}
});
test('PDF final : tous les postes, dimensions de fin de description et total contrôlé restent présents',async()=>{
 const workspace=seedMobileWorkspace(),rows=items();const document={...workspace.quotes[0],items:rows.map((r,index)=>({id:String(index),label:r.label,description:r.description,quantity:r.quantity,unit:r.unit,unitPrice:r.unit_price,taxRate:r.tax_rate})),...totals(rows)};
 const blob=await buildBusinessDocumentPdf({document,customer:workspace.customers[0],company:{displayName:'CHAPET Père et Fils'},profile:null});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 try{const pdf=await task.promise,parts:string[]=[];for(let i=1;i<=pdf.numPages;i++){const content=await(await pdf.getPage(i)).getTextContent();parts.push(...content.items.flatMap(item=>'str'in item?[item.str]:[]));}
 const text=parts.join(' ');assert.match(text,/4 833,40/);assert.match(text,/70,16/);assert.match(text,/0\.80 l/);assert.match(text,/R48 M48/);assert.match(text,/charnières invisibles/);}
 finally{await task.destroy();}
});

test('TTC en prix unitaire et HT en total ne sont pas comparés comme des montants de même nature',()=>{
 const doc=source();doc.rows=doc.rows.slice(0,1);Object.assign(doc.rows[0],{quantity:2,unit_price:110,line_total:200,tax_rate:10});doc.tax_column='rate';doc.unit_price_type='ttc';doc.line_total_type='ht';
 const docs=reconcileSourceReadings(parse(doc),parse(doc));assert.equal(items(plan(transcript(docs)))[0].unit_price,100);assert.equal(items(plan(transcript(docs)))[0].quantity,2);
});
test('sauvegarde du brouillon : description longue conservée jusqu’à la transaction, sans écriture réelle',async()=>{
 const action=plan(),description='Protection et préparation complète. '.repeat(40)+'Dimensions finales 1.20 m x 0.50 m x 0.80 m.';
 items(action)[5].description=description;action.payload.customer_id='client';
 const proposal={id:'proposal',organization_id:'org',created_by:'user',intent_type:'prepare_quote',payload:action.payload,status:'ready',risk_level:'review',missing_fields:[]};
 let saved:unknown;
 const client={from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,update:()=>query,in:async()=>({data:[proposal],error:null}),maybeSingle:async()=>({data:{id:table==='customers'?'client':'proposal'},error:null})};return query;
 },rpc:async(name:string,payload:{p_items:unknown})=>{assert.equal(name,'save_quote_document');saved=payload.p_items;return {data:'quote-id',error:null};}};
 const context={user:{id:'user'},client,memberships:[{organizationId:'org',role:'owner'}]} as unknown as Parameters<typeof executeProposalBatch>[0]['context'];
 await executeProposalBatch({context,organizationId:'org',proposalIds:['proposal'],explicitConfirmation:false});
 assert.equal((saved as Array<{description:string}>)[5].description,description);
});

test('ordre de mission sans tableau : le parcours existant de demande de travaux reste disponible',()=>{
 const doc=parse()[0];doc.kind='insurance';doc.rows=[];assert.equal(canonicalSourceRows(transcript([doc])),null);
});
test('taux illisible n’est pas remplacé par le taux par défaut, légende explicite conservée',()=>{
 const doc=source();doc.tax_column='rate';(doc.rows[0] as unknown as {tax_rate:string}).tax_rate='illisible';assert.equal(items(plan(transcript(parse(doc))))[0].tax_rate,null);
 doc.rows[0].tax_rate=5.5;assert.equal(items(plan(transcript(parse(doc))))[0].tax_rate,5.5);
});

test('les données de contrôle ont leur propre budget : un document lisible de 10 000 caractères ne perd pas ses descriptions à cause du JSON',()=>{
 const docs=parse();docs[0].rows.forEach(row=>row.description+=' Complément de description des travaux à conserver.'.repeat(18));
 const observations=sourceDocumentObservations(docs);assert.ok(observations.length>10000);const request=quoteSourceRequest('',observations);assert.ok(request.length<=20000);assert.equal(items(plan(request)).length,10);
});

test('note photographiée : ses marqueurs ne contournent pas la reprise canonique des postes contrôlés',()=>{
 const doc=source();doc.kind='pricing_note';doc.observations='Début de la note artisan :\nPapier peint\n42.08 m2 à 22.50\nFin de la note artisan';
 assert.equal(canonicalSourceRows(transcript(parse(doc)))?.length,10);
});
