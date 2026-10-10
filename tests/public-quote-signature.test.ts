import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../app/api/signatures/public/route';
import {createQuoteSignatureRequest,requireSignatureToken,signatureTokenHash} from '../lib/quote-signature';
import type {SupabaseClient} from '@supabase/supabase-js';
const token='a'.repeat(64);
test('un devis accepté pendant la préparation est relu et aucun lien périmé n’est créé',async()=>{
 const calls:string[]=[];let reads=0;
 const chain={select(){return this},eq(){return this},async single(){calls.push('quote');reads++;return {data:{id:'quote-id',status:reads===1?'draft':'accepted'},error:null}}};
 const admin={from(){return chain},async rpc(){calls.push('snapshot');return {data:{version:1},error:null}}} as unknown as SupabaseClient;
 await assert.rejects(()=>createQuoteSignatureRequest(admin,'organization','DEV-2026-028','client@example.fr','https://manufeo.fr'),/ne peut plus/);
 assert.deepEqual(calls,['quote','snapshot','quote']);
});
test('les liens invalides et le consentement absent sont refusés avant tout accès serveur',async()=>{
 assert.throws(()=>requireSignatureToken('devis-123'),/invalide/);
 assert.notEqual(signatureTokenHash(token),token);
 const invalid=await GET(new Request('https://manufeo.test/api/signatures/public?token=short'));assert.equal(invalid.status,404);
 const missing=await POST(new Request('https://manufeo.test/api/signatures/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,signerName:'Bernard',consent:false})}));assert.equal(missing.status,400);
});
test('la signature utilise uniquement le jeton haché et retourne le refus d’une version modifiée',async()=>{
 const saved=process.env.SUPABASE_SERVICE_ROLE_KEY,prior=globalThis.fetch;
 process.env.SUPABASE_SERVICE_ROLE_KEY='signature-test-key';
 let payload:Record<string,unknown>|null=null;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(String(options?.body));return Response.json({message:'quote_changed',code:'P0001'},{status:400})};
 try{
  const result=await POST(new Request('https://manufeo.test/api/signatures/public',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'192.0.2.50'},body:JSON.stringify({token,signerName:'Bernard Lombard',consent:true})}));
  assert.equal(result.status,409);assert.match((await result.json()).error,/modifié/);
  assert.equal(payload!['p_token_hash'],signatureTokenHash(token));assert.notEqual(payload!['p_ip_hash'],'192.0.2.50');
 }finally{globalThis.fetch=prior;if(saved===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved;}
});
test('signature : les lignes descriptives restent dans le PDF sans empêcher les postes chiffrés',async()=>{
 const uploads:Array<{bytes:Uint8Array}>=[];
 const quote={id:'quote-id',number:'DEV-2026-043',title:'Intégration plaque inox',status:'draft',issue_date:'2026-10-10',expiry_date:'2026-11-10',subtotal:5661,tax_total:566.1,total:6227.1,customer_id:'client-id',notes:'',customer:{id:'client-id',kind:'individual',last_name:'Client',emails:['client@example.fr'],phones:[],addresses:[]},items:[
  {label:'Réalisation en atelier du châssis',quantity:null,unit_price:null,tax_rate:10},
  {label:'Mise en place sur site',quantity:null,unit_price:null,tax_rate:10},
  {label:'Fourniture et mise en place des tôles inox',quantity:1,unit:'U',unit_price:5661,tax_rate:10},
 ]};
 const snapshot={version:1};
 const admin={from(table:string){const chain={select(){return this},eq(){return this},insert(){return this},async single(){return {data:table==='quotes'?quote:table==='organizations'?{id:'organization',name:'Entreprise Test'}:{id:'request-id'},error:null}},async maybeSingle(){return {data:null,error:null}}};return chain},async rpc(){return {data:snapshot,error:null}},storage:{from(){return {async upload(_path:string,bytes:Uint8Array){uploads.push({bytes});return {error:null}},async remove(){return {error:null}}}}}} as unknown as SupabaseClient;
 const signing=await createQuoteSignatureRequest(admin,'organization',quote.number,'client@example.fr','https://manufeo.fr');
 assert.match(signing.url,/^https:\/\/manufeo.fr\/signer\/[a-f0-9]{64}$/);assert.equal(uploads.length,1);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(Buffer.from(signing.pdf.content,'base64'))});
 try{const pdf=await task.promise;const texts=[];for(let i=1;i<=pdf.numPages;i++){texts.push((await(await pdf.getPage(i)).getTextContent()).items.flatMap(item=>'str'in item?[item.str]:[]).join(' '))}const text=texts.join(' ');assert.match(text,/Réalisation en atelier du châssis/);assert.match(text,/Mise en place sur site/);assert.match(text,/6 227,10/);assert.doesNotMatch(text,/À préciser/);}finally{await task.destroy()}
});
