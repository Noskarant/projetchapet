import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteReminderDueAt, quoteCanBeReminded, quoteReminderMessage } from '../lib/quote-reminders';
import { runAutomaticQuoteReminders } from '../lib/automatic-quote-reminders';
import { GET } from '../app/api/cron/quote-reminders/route';
import { normalizeCompanyProfile } from '../lib/company-profile';

const now = new Date('2026-10-07T08:00:00Z');
const quote = { id:'11111111-1111-4111-8111-111111111111',organization_id:'org-test',customer_id:'customer-test',number:'DEV-2026-001',title:'Menuiserie',status:'sent',sent_at:'2026-09-07T08:00:00Z',archived_at:null,accepted_at:null,signed_at:null,issue_date:'2026-09-07',expiry_date:null,subtotal:754,tax_total:0,total:754,notes:null,items:[{label:'Tapée',quantity:1,unit:'forfait',unit_price:754,tax_rate:0}],customer:{id:'customer-test',organization_id:'org-test',kind:'individual',company_name:null,civility:'Mme',first_name:'Michelle',last_name:'Test',emails:['client@example.fr'],phones:[],addresses:[],siret:null,vat_number:null,notes:null} };

test('un mois calendaire : borne exacte, mois courts et année bissextile',()=>{
  assert.equal(quoteReminderDueAt('2026-01-31T09:42:00Z')!.toISOString(),'2026-02-28T09:42:00.000Z');
  assert.equal(quoteReminderDueAt('2024-01-31T09:42:00Z')!.toISOString(),'2024-02-29T09:42:00.000Z');
  assert.equal(quoteReminderDueAt('2026-12-31T09:42:00Z')!.toISOString(),'2027-01-31T09:42:00.000Z');
  assert.equal(quoteReminderDueAt('invalid'),null);
  assert.equal(quoteCanBeReminded(quote,now),true);
  assert.equal(quoteCanBeReminded(quote,new Date(now.getTime()-1)),false);
  for(const status of ['draft','accepted','refused','cancelled','expired'])assert.equal(quoteCanBeReminded({...quote,status},now),false);
  for(const field of ['archived_at','accepted_at','signed_at'])assert.equal(quoteCanBeReminded({...quote,[field]:now.toISOString()},now),false);
  assert.equal(quoteCanBeReminded({...quote,sent_at:null},now),false);
  assert.equal(normalizeCompanyProfile({}).automaticQuoteReminderEnabled,false);
  assert.equal(normalizeCompanyProfile({automaticQuoteReminderEnabled:true}).automaticQuoteReminderEnabled,true);
});

test('message lisible avec réponses à l’entreprise, caractères HTML protégés',()=>{
  const message=quoteReminderMessage('D001','<img src=x>','Atelier & fils','contact@example.fr');
  assert.match(message.text, /devis D001/);assert.match(message.text,/répondre/);assert.match(message.html,/&lt;img src=x&gt;/);assert.doesNotMatch(message.html,/<img/);
});

test('cron : protection, mode de simulation, doublons, exclusions et accusés incertains',async()=>{
  const originalFetch=globalThis.fetch;
  const prior={CRON_SECRET:process.env.CRON_SECRET,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,RESEND_API_KEY:process.env.RESEND_API_KEY};
  process.env.CRON_SECRET='cron-test';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';process.env.RESEND_API_KEY='email-test';
  let current={...quote},enabled=true,billed=false,providerStatus=200,networkFails=false;
  let journal:Record<string,any>|null=null,sendCount=0,reservations=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    const method=init?.method||'GET';
    const body=init?.body?JSON.parse(String(init.body)):null;
    if(url.hostname==='api.resend.com'){
      sendCount++;assert.ok(journal);assert.equal(journal.status,'sending');
      assert.equal(body.to[0],'client@example.fr');assert.equal(body.reply_to,'atelier@example.fr');
      assert.match(body.attachments[0].content,/^JVBER/);
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'),`quote-reminder/${quote.id}`);
      if(networkFails)throw new TypeError('network');
      return Response.json(providerStatus===200?{id:'provider-test'}:{message:'refused'},{status:providerStatus});
    }
    if(url.pathname.endsWith('/rpc/due_quote_reminders'))return Response.json([current]);
    if(url.pathname.endsWith('/quotes'))return Response.json(current);
    if(url.pathname.endsWith('/pilot_workspace_snapshots'))return Response.json({company_profile:{automaticQuoteReminderEnabled:enabled,displayName:'Atelier Test',email:'atelier@example.fr'}});
    if(url.pathname.endsWith('/organizations'))return Response.json({id:'org-test',name:'Atelier Test',address:null,email:'atelier@example.fr'});
    if(url.pathname.endsWith('/invoices'))return Response.json(billed?[{id:'invoice-test'}]:[]);
    if(url.pathname.endsWith('/quote_reminder_dispatches')){
      if(method==='GET')return Response.json(journal);
      if(method==='POST'){
        reservations++;
        if(journal)return Response.json({code:'23505'},{status:409});
        journal={...body,attempts:1};return new Response(null,{status:201});
      }
      if(method==='PATCH'){
        if(journal)journal={...journal,...body};
        return new Response(null,{status:204});
      }
    }
    throw new Error(`Unexpected ${method}: ${url.pathname}`);
  };
  try {
    assert.equal((await GET(new Request('https://manufeo.fr/api/cron/quote-reminders'))).status,401);
    const preview=await runAutomaticQuoteReminders({now,dryRun:true});assert.equal(preview.outcomes[0].status,'due');assert.equal(sendCount,0);assert.equal(reservations,0);
    for(const exclusion of ['accepted','billed','disabled','email']){
      current={...quote,status:exclusion==='accepted'?'accepted':'sent',customer:{...quote.customer,emails:exclusion==='email'?[]:quote.customer.emails}};
      billed=exclusion==='billed';enabled=exclusion!=='disabled';
      await runAutomaticQuoteReminders({now});assert.equal(sendCount,0);
    }
    current={...quote};billed=false;enabled=true;
    assert.equal((await runAutomaticQuoteReminders({now})).outcomes[0].status,'sent');assert.equal(sendCount,1);assert.equal((journal as Record<string,unknown>|null)?.status,'sent');
    await runAutomaticQuoteReminders({now});assert.equal(sendCount,1);
    journal=null;networkFails=true;
    assert.equal((await runAutomaticQuoteReminders({now})).outcomes[0].status,'uncertain');assert.equal((journal as Record<string,unknown>|null)?.status,'uncertain');
    await runAutomaticQuoteReminders({now:new Date('2026-10-10T08:00:00Z')});assert.equal(sendCount,2);
    journal=null;networkFails=false;providerStatus=429;
    assert.equal((await runAutomaticQuoteReminders({now})).outcomes[0].status,'failed');assert.equal((journal as Record<string,unknown>|null)?.status,'failed');
    const count=sendCount;
    await runAutomaticQuoteReminders({now});assert.equal(sendCount,count);
  } finally {
    globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('un e-mail réellement accepté date le devis, une copie comptable ou sans prix ne démarre pas de relance',async()=>{
  const {POST}=await import('../app/api/email/route');
  const originalFetch=globalThis.fetch,priorKey=process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY='email-test';
  const writes:Array<Record<string,unknown>>=[];
  let sent=false;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    const body=init?.body?JSON.parse(String(init.body)):null;
    if(url.hostname==='api.resend.com'){sent=true;return Response.json({id:'provider-email-test'});}
    if(url.pathname.endsWith('/auth/v1/user'))return Response.json({id:'user-test'});
    if(url.pathname.endsWith('/organization_members'))return Response.json([{organization_id:'org-test'}]);
    if(url.pathname.endsWith('/pilot_workspace_snapshots'))return Response.json([]);
    if(url.pathname.endsWith('/organizations'))return Response.json([{id:'org-test',accountant_email:'comptable@example.fr'}]);
    if(url.pathname.endsWith('/customers'))return Response.json([{id:'customer-test',emails:['client@example.fr']}]);
    if(url.pathname.endsWith('/quotes')){
      if(init?.method==='PATCH'){assert.equal(sent,true);writes.push(body);return Response.json({id:quote.id});}
      return Response.json([{id:quote.id,organization_id:'org-test',customer_id:'customer-test',number:quote.number,status:'draft',sent_at:null}]);
    }
    throw new Error(`Unexpected ${url.pathname}`);
  };
  const call=(to:string,filename:string)=>POST(new Request('https://manufeo.fr/api/email',{method:'POST',headers:{Authorization:'Bearer token-test','Content-Type':'application/json','x-forwarded-for':filename},body:JSON.stringify({documentKind:'quote',documentNumber:quote.number,to,subject:'Votre devis',attachments:[{filename,content:Buffer.from('%PDF-1.7 test').toString('base64')}]})}));
  try{
    assert.equal((await call('client@example.fr','devis.pdf')).status,200);assert.equal(writes.length,1);assert.equal(writes[0].status,'sent');assert.ok(writes[0].sent_at);
    assert.equal((await call('client@example.fr','devis-sans-prix.pdf')).status,200);assert.equal(writes.length,1);
    assert.equal((await call('comptable@example.fr','copie-devis.pdf')).status,200);assert.equal(writes.length,1);
  }finally{globalThis.fetch=originalFetch;if(priorKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=priorKey;}
});
