import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as parse } from '../app/api/ai/parse/route';
import { POST as strict } from '../app/api/ai/parse-strict/route';
import { POST as command } from '../app/api/ai/command/route';
import { POST as agenda } from '../app/api/ai/agenda/route';
import { POST as copilot } from '../app/api/copilot/proposal/route';
import { POST as transcribe } from '../app/api/transcribe/route';
import { POST as recovery } from '../app/api/team/recovery/route';
import { GET as signatures } from '../app/api/signatures/route';
import { GET as activity } from '../app/api/project-activity/route';
import { readJsonBody } from '../lib/api-guard';
import { organizationErrorResponse } from '../lib/server-organization';
import { assertActiveSession } from '../lib/session-security';
import { middleware } from '../middleware';
import { contentSecurityPolicy } from '../lib/content-security-policy';

const user = '22222222-2222-4222-8222-222222222222';
const org = '11111111-1111-4111-8111-111111111111';
const token = `fixture.${Buffer.from(JSON.stringify({session_id:'33333333-3333-4333-8333-333333333333'})).toString('base64url')}.signature`;
let sequence=0;
function request(path='/api/ai/parse', auth=true) {
  return new Request(`https://manufeo.test${path}`, { method:'POST', headers:{'Content-Type':'application/json','x-forwarded-for':`security-${++sequence}`,...(auth?{Authorization:`Bearer ${token}`}:{})}, body:JSON.stringify({kind:'document',target:'quote',transcript:'Peinture 12 m² à 20 euros HT, TVA 10 %.'})});
}
async function authFixture(run: (calls:string[])=>Promise<void>, options:{role?:string;active?:boolean;quota?:boolean;valid?:boolean;targetRole?:string}={}) {
 const previous=globalThis.fetch,key=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';const calls:string[]=[];
 globalThis.fetch=async input=>{
  const url=String(input instanceof Request?input.url:input);calls.push(url);
  if(url.includes('/auth/v1/user'))return Response.json({id:user,email:'worker@audit.invalid'},{status:options.valid===false?401:200});
  if(url.includes('/rpc/manufeo_session_active'))return Response.json(options.active!==false);
  if(url.includes('/rpc/manufeo_consume_ai_quota'))return Response.json(options.quota!==false);
  if(url.includes('/organization_members'))return Response.json(url.includes('select=user_id')?[{user_id:'44444444-4444-4444-8444-444444444444',role:options.targetRole||'owner'}]:[{organization_id:org,role:options.role||'owner'}]);
  if(url.includes('/auth/v1/admin/users'))return Response.json({user:{email:'owner@audit.invalid'}});
  if(url.includes('/artisan_workflow_records'))return Response.json([{id:'worker-contact',payload:{email:'worker@audit.invalid'}}]);
  if(url.includes('/commercial_project_members'))return Response.json([{project_id:'assigned-project'}]);
  if(url.includes('/project_notes'))return Response.json([]);
  throw new Error(`Unexpected privileged/provider call: ${url}`);
 };
 try{await run(calls);}finally{globalThis.fetch=previous;if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
}

test('all legacy AI/audio endpoints reject anonymous requests before any provider/auth/body read',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('No network expected');};
 try{for(const handler of [parse,strict,command,agenda,copilot,transcribe])assert.equal((await handler(request(undefined,false))).status,401);assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
test('forged and revoked sessions cannot spend credits',async()=>{
 for(const options of [{valid:false},{active:false}])await authFixture(async calls=>{assert.equal((await parse(request())).status,401);assert.ok(calls.every(url=>!url.includes('consume_ai_quota')));},options);
});
test('worker role cannot call financial AI, exhausted quota returns 429 without a provider call',async()=>{
 await authFixture(async calls=>{assert.equal((await parse(request())).status,403);assert.ok(calls.every(url=>!url.includes('consume_ai_quota')));},{role:'worker'});
 await authFixture(async calls=>{assert.equal((await parse(request())).status,429);assert.ok(calls.some(url=>url.includes('consume_ai_quota')));},{quota:false});
});
test('server session verification fails closed if its credential is absent',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{await assert.rejects(()=>assertActiveSession(token,user),{status:503});}finally{if(previous!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});
test('worker cannot read signatures or unassigned project activity through the privileged API',async()=>{
 await authFixture(async calls=>{
  assert.equal((await signatures(new Request('https://manufeo.test/api/signatures',{headers:{Authorization:`Bearer ${token}`}}))).status,403);
  assert.equal((await activity(new Request('https://manufeo.test/api/project-activity?projectId=other-project',{headers:{Authorization:`Bearer ${token}`}}))).status,403);
  assert.ok(calls.every(url=>!url.includes('/project_notes')&&!url.includes('/document_signatures')));
  const response=await activity(new Request('https://manufeo.test/api/project-activity',{headers:{Authorization:`Bearer ${token}`}}));assert.equal(response.status,200);
  assert.ok(calls.filter(url=>url.includes('/project_notes')).every(url=>decodeURIComponent(url).includes('project_id=in.(assigned-project)')));
 },{role:'worker'});
});
test('admin cannot revoke owner or another admin sessions',async()=>{
 for(const targetRole of ['owner','admin'])await authFixture(async calls=>{
  const response=await recovery(new Request('https://manufeo.test/api/team/recovery',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','x-forwarded-for':`recovery-${++sequence}`},body:JSON.stringify({email:'owner@audit.invalid'})}));
  assert.equal(response.status,403);assert.ok(calls.every(url=>!url.includes('revoke_sessions')&&!url.includes('recover')));
 },{role:'admin',targetRole});
});
test('oversize chunked JSON cancels its stream before buffering the whole upload',async()=>{
 let cancelled=false,pulls=0;
 const stream=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
 const input=new Request('https://manufeo.test/api/test',{method:'POST',body:stream,duplex:'half'} as RequestInit);
 await assert.rejects(()=>readJsonBody(input,1500),{status:413});assert.equal(cancelled,true);assert.ok(pulls<=3);
});
test('malformed JSON stays a 400 and infrastructure errors do not leak to clients',async()=>{
 await assert.rejects(()=>readJsonBody(new Request('https://manufeo.test',{method:'POST',body:'{'}),200),{status:400});
 const response=organizationErrorResponse(new Error('private provider key: forbidden-secret'));
 assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/forbidden-secret|provider/);
});
test('CSRF checks still reject a foreign Origin even when Fetch Metadata claims same-origin',()=>{
 const response=middleware(new NextRequest('https://manufeo.test/api/test',{method:'POST',headers:{Origin:'https://evil.test','Sec-Fetch-Site':'same-origin'}}));assert.equal(response.status,403);
});
test('browser nonce is fresh and untrusted nonce headers are replaced',()=>{
 const input=new NextRequest('https://manufeo.test/',{headers:{'x-nonce':'attacker'}});
 const first=middleware(input),second=middleware(input);const csp=first.headers.get('content-security-policy')!;
 assert.match(csp,/'nonce-[A-Za-z0-9+/]+=*'/);assert.doesNotMatch(csp,/attacker|unsafe-inline.*script/);
 assert.notEqual(csp,second.headers.get('content-security-policy'));
 assert.match(csp,/connect-src 'self' blob:/); // Safari PDF reader fetches local generated blobs.
 const script=contentSecurityPolicy('nonce-value').split(';').map(rule=>rule.trim()).find(rule=>rule.startsWith('script-src '))!;
 assert.doesNotMatch(script,/unsafe-inline|unsafe-eval/);assert.match(csp,/script-src-attr 'none'/);
});

test('browser-facing Host handles Next proxy URL normalization without accepting foreign origins',()=>{
 const response=middleware(new NextRequest('http://localhost:3000/api/test',{method:'POST',headers:{Host:'127.0.0.1:3000',Origin:'http://127.0.0.1:3000','Sec-Fetch-Site':'same-origin'}}));assert.equal(response.status,200);
 const refused=middleware(new NextRequest('http://localhost:3000/api/test',{method:'POST',headers:{Host:'127.0.0.1:3000',Origin:'http://evil.test','Sec-Fetch-Site':'same-origin'}}));assert.equal(refused.status,403);
});
