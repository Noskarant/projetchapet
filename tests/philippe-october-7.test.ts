import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { readPdfTextContent } from '../lib/pdf-text-content';
import { normalizeModelPlan } from '../lib/action-planner';
import { quoteSourceRequest } from '../lib/quote-sources';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { seedMobileWorkspace, sortedCustomers } from '../lib/mobile-prototype';
import { readQuoteInternalMeta, writeQuoteInternalMeta } from '../lib/mobile-quote-preview';
import { smsHref } from '../lib/document-sms';
import { POST as shareDocument } from '../app/api/documents/share/route';
import { GET as workerWorkspace } from '../app/api/worker-workspace/route';

test('PDF Safari : extraire toutes les pages sans itérateur asynchrone ReadableStream', async () => {
  const document = new jsPDF(); document.text('TVA : 10 %', 20, 20); document.addPage(); document.text('Seconde page', 20, 20);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(document.output('arraybuffer')) });
  const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  try {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { configurable: true, value: undefined });
    const pdf = await task.promise;
    const first = (await readPdfTextContent(await pdf.getPage(1))).items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
    const second = (await readPdfTextContent(await pdf.getPage(2))).items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
    assert.match(first, /TVA : 10 %/); assert.match(second, /Seconde page/);
  } finally {
    if (descriptor) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, descriptor);
    await task.destroy();
  }
});

test('TVA sources : récapitulatif, taux distincts, TVA absente et priorité artisan', () => {
  const item = (label: string, rate: number | null, evidence = '') => ({ label, quantity: 1, unit: 'forfait', unit_price: 100, tax_rate: rate, tax_evidence: evidence });
  const rates = (items: object[], observations: string, instructions = '') => (normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint: 'Dupont', items } }] }, quoteSourceRequest(instructions, observations))[0].payload.items as Array<{ tax_rate: number | null }>).map(line => line.tax_rate);
  assert.deepEqual(rates([item('Plafond', null)], 'Plafond : 100 euros HT. TVA : 10 %.'), [10]);
  const table = 'Désignation | Prix HT | TVA\nPlafond | 100 euros HT | 10 %\nPorte | 100 euros HT | 20 %';
  assert.deepEqual(rates([item('Plafond', 10, 'Plafond | 100 euros HT | 10 %'), item('Porte', 20, 'Porte | 100 euros HT | 20 %')], table), [10, 20]);
  assert.deepEqual(rates([item('Plafond', 20)], 'Plafond : 100 euros HT. TVA non indiquée.'), [null]);
  assert.deepEqual(rates([item('Plafond', 20, 'Majoration : 20 %')], 'Plafond : 100 euros HT. Majoration : 20 %. TVA non indiquée.'), [null]);
  assert.deepEqual(rates([item('Plafond', 20, 'Majoration : 20 %')], table, 'Majoration : 20 %.'), [null]);
  assert.deepEqual(rates([item('Plafond', 20, 'TVA : 20 %')], 'Plafond : 100 euros HT. TVA : 20 %.', 'Applique TVA 10 %.'), [10]);
  assert.deepEqual(rates([item('Plafond', 20, 'TVA : 20 %')], 'Plafond : 100 euros HT. TVA : 20 %.', 'Applique TVA 10 % uniquement pour cette ligne.'), [20]);
  assert.deepEqual(rates([item('Plafond', 10, 'TVA : 10 %'), item('Porte', 20, 'TVA : 20 %')], 'Plafond : 100 euros HT. TVA : 10 %. Porte : 100 euros HT. TVA : 20 %.', 'Les taux sont TVA 10 % et TVA 20 %.'), [10, 20]);
  assert.deepEqual(rates([item('Plafond', 10, 'Pour cette ligne uniquement, TVA 10 %.'), item('Porte', 20, 'TVA : 20 %')], 'Plafond : 100 euros HT. TVA : 20 %. Porte : 100 euros HT. TVA : 20 %.', 'Applique TVA 20 % à l’ensemble du devis. Pour cette ligne uniquement, TVA 10 %.'), [10, 20]);
  assert.deepEqual(rates([item('Plafond', 0, 'TVA : 0 %')], 'Plafond : 100 euros HT. TVA : 0 %.'), [0]);
});

test('consignes équipe : persistantes, dans le PDF équipe et jamais dans le PDF client', async () => {
  const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const workspace = seedMobileWorkspace(), quote = workspace.quotes[0];
  const meta = { discountPercent: 0, internalNotes: 'Marge privée confidentielle 40 pour cent', teamInstructions: 'Prévoir deux personnes pendant deux jours' };
  writeQuoteInternalMeta(storage, quote.number, meta); assert.deepEqual(readQuoteInternalMeta(storage, quote.number), meta);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const withoutPrices of [false, true]) {
    const blob = await buildBusinessDocumentPdf({ document: quote, company: {}, customer: workspace.customers[0], quoteMeta: meta, withoutPrices, profile: null });
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    try {
      const pdf = await task.promise; let text = '';
      for (let n = 1; n <= pdf.numPages; n++) text += (await readPdfTextContent(await pdf.getPage(n))).items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
      assert.doesNotMatch(text, /Marge privée confidentielle/);
      if (withoutPrices) assert.match(text, /Prévoir deux personnes pendant deux jours/);
      else assert.doesNotMatch(text, /Prévoir deux personnes pendant deux jours/);
    } finally { await task.destroy(); }
  }
});

test('clients : civilités composées ignorées, accents français et aucun ID perdu', () => {
  const base = seedMobileWorkspace().customers[0];
  const clients = [{...base,id:'l',lastName:'et Madame Lombard',firstName:'',kind:'Particulier' as const},{...base,id:'b',lastName:'Bazin',kind:'Particulier' as const},{...base,id:'a',lastName:'M. et Mme André',kind:'Particulier' as const}];
  assert.deepEqual(sortedCustomers(clients).map(item => item.id), ['a','b','l']); assert.equal(clients[0].id, 'l');
});

test('SMS : numéro nettoyé et message encodé pour iPhone et Android', () => {
  const message = 'Bonjour, devis D-1 : https://pdf.test/?token=a&b=c';
  assert.equal(smsHref('06 12 34 56 78', message, true), `sms:0612345678&body=${encodeURIComponent(message)}`);
  assert.equal(smsHref('+33 (6) 12 34 56 78', message, false), `sms:+33612345678?body=${encodeURIComponent(message)}`);
});

test('partage PDF : contrôle du rôle et de l’entreprise avant stockage privé et lien de sept jours', async () => {
  const org = '11111111-1111-4111-8111-111111111111';
  const originalFetch = globalThis.fetch, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
  let role = 'owner', exists = true, uploads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: '22222222-2222-4222-8222-222222222222' });
    if (url.includes('/rpc/manufeo_session_active')) return Response.json(true);
    if (url.includes('/organization_members')) return Response.json([{ organization_id: org, role }]);
    if (url.includes('/rest/v1/quotes')) { assert.match(url, /organization_id=eq\.11111111/); return Response.json(exists ? {id:'quote-1',number:'D-1',customer:{phones:['0612345678']}} : null); }
    if (url.includes('/storage/v1/object/sign/document-shares/')) { assert.equal(JSON.parse(String(init?.body)).expiresIn, 604800); return Response.json({signedURL:'/object/sign/document-shares/test.pdf?token=test'}); }
    if (url.includes('/storage/v1/object/document-shares/')) { uploads++; return Response.json({Key:'test.pdf'}); }
    throw new Error(`Unexpected request ${url}`);
  };
  const payload = {organizationId:org,number:'D-1',kind:'quote',content:Buffer.from('%PDF-1.7 test').toString('base64')}; let index=0;
  const call = (body = payload, token = `test.${Buffer.from(JSON.stringify({session_id:'33333333-3333-4333-8333-333333333333'})).toString('base64url')}.signature`) => shareDocument(new Request('https://manufeo.test/api/documents/share',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':`sms-test-${++index}`,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}));
  try {
    const response=await call(); assert.equal(response.status,200); assert.equal((await response.json()).phone,'0612345678'); assert.equal(uploads,1);
    assert.equal((await call(payload,'')).status,401);
    assert.equal((await call({...payload,organizationId:'foreign-org'})).status,403);
    role='worker'; assert.equal((await call()).status,403); role='owner';
    exists=false; assert.equal((await call()).status,404); exists=true;
    assert.equal((await call({...payload,content:Buffer.from('not-pdf').toString('base64')})).status,400);
    assert.equal(uploads,1);
  } finally { globalThis.fetch=originalFetch; if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey; }
});

test('collaborateur : seules les consignes des chantiers affectés sont exposées, jamais les notes privées', async () => {
  const org='11111111-1111-4111-8111-111111111111', quote='44444444-4444-4444-8444-444444444444';
  const originalFetch=globalThis.fetch,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-key';let assigned=true,metaReads=0;
  globalThis.fetch=async input=>{
    const url=String(input instanceof Request?input.url:input);
    if(url.includes('/auth/v1/user'))return Response.json({id:'22222222-2222-4222-8222-222222222222',email:'worker@example.fr'});
    if(url.includes('/rpc/manufeo_session_active'))return Response.json(true);
    if(url.includes('/organization_members'))return Response.json({organization_id:org,role:'worker'});
    if(url.includes('/artisan_workflow_records'))return Response.json([{id:'C-1',payload:{email:'worker@example.fr'}}]);
    if(url.includes('/commercial_project_members'))return Response.json(assigned?[{project_id:'P-1'}]:[]);
    if(url.includes('/commercial_projects')){assert.ok(url.includes('P-1'));return Response.json([{id:'P-1',name:'Chantier affecté',quote_id:quote}]);}
    if(url.includes('/commercial_project_steps')||url.includes('/commercial_project_photos'))return Response.json([]);
    if(url.includes('/rest/v1/quotes')){assert.ok(url.includes(quote));return Response.json([{id:quote,number:'D-1'}]);}
    if(url.includes('/quote_private_meta')){metaReads++;assert.ok(url.includes('D-1'));assert.doesNotMatch(url,/internal_notes|discount_percent/);return Response.json([{quote_number:'D-1',team_instructions:'Travaux sur deux jours'}]);}
    throw new Error(`Unexpected request ${url}`);
  };
  const token=`test.${Buffer.from(JSON.stringify({session_id:'33333333-3333-4333-8333-333333333333'})).toString('base64url')}.signature`;
  try{
    const result=await workerWorkspace(new Request('https://manufeo.test/api/worker-workspace',{headers:{Authorization:`Bearer ${token}`}}));
    assert.equal(result.status,200);assert.equal((await result.json()).projects[0].teamInstructions,'Travaux sur deux jours');
    assigned=false;const empty=await workerWorkspace(new Request('https://manufeo.test/api/worker-workspace',{headers:{Authorization:`Bearer ${token}`}}));assert.deepEqual((await empty.json()).projects,[]);assert.equal(metaReads,1);
  }finally{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
