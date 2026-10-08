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
