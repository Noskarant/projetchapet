import { authenticatedRoute } from "./helpers/authenticated-route";
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { POST as sendEmailHandler } from '../app/api/email/route';
import { POST as extractSourcesHandler } from '../app/api/ai/quote-sources/route';
import { readQuoteSources } from '../lib/quote-source-reader';
import { validateQuoteSources } from '../lib/quote-source-validation';
import { quoteSourceRequest } from '../lib/quote-sources';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { seedMobileWorkspace, calculateTotals } from '../lib/mobile-prototype';

const org = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
let requestId = 0;
function request(path: string, body: unknown, token = 'test-token') {
  return new Request(`http://localhost${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-forwarded-for': `test-${++requestId}`,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
}

test('envoi manuel à une autre adresse : autorisé uniquement pour un document de son entreprise', async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  let exists = true;
  const deliveries: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: user });
    if (url.includes('/organization_members')) return Response.json([{ organization_id: org, role: 'owner' }]);
    if (url.includes('/pilot_workspace_snapshots')) return Response.json([]);
    if (url.includes('/invoices')) return Response.json(exists ? [{ organization_id: org, customer_id: 'customer', number: 'FAC-2026-004' }] : []);
    if (url.includes('/customers')) return Response.json([{ id: 'customer', emails: ['client@example.fr'] }]);
    if (url.includes('/organizations')) return Response.json([{ id: org, accountant_email: null }]);
    if (url.includes('api.resend.com')) { deliveries.push(JSON.parse(String(init?.body))); return Response.json({ id: 'sent-test' }); }
    throw new Error(`Unexpected request: ${url}`);
  };
  const payload = { documentNumber: 'FAC-2026-004', documentKind: 'invoice', to: 'Autre@Example.fr', customRecipient: true, subject: 'Facture', attachments: [{ filename: 'FAC-2026-004.pdf', content: Buffer.from('%PDF-1.7 test').toString('base64') }] };
  try {
    assert.equal((await sendEmail(request('/api/email', payload))).status, 200);
    assert.deepEqual(deliveries[0].to, ['autre@example.fr']);
    assert.equal((await sendEmail(request('/api/email', { ...payload, customRecipient: false }))).status, 403);
    assert.equal((await sendEmail(request('/api/email', { ...payload, to: 'invalide' }))).status, 400);
    assert.equal((await sendEmail(request('/api/email', payload, ''))).status, 401);
    exists = false;
    assert.equal((await sendEmail(request('/api/email', payload))).status, 404);
    assert.equal(deliveries.length, 1);
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey; }
});

test('sources : fichiers TXT sans vision, et refus avant appel IA des sources non autorisées', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: user });
    if (url.includes('/organization_members')) return Response.json([{ organization_id: org, role: 'owner' }]);
    throw new Error('No vision or other request expected');
  };
  const payload = { organizationId: org, sources: [{ name: 'metres.txt', text: 'Client Dupont. Peinture plafond 100 m² à 23 euros HT. TVA 10 %.' }] };
  try {
    const response = await extractSources(request('/api/ai/quote-sources', payload));
    assert.equal(response.status, 200);
    assert.match((await response.json()).observations, /100 m² à 23 euros HT/);
    assert.equal((await extractSources(request('/api/ai/quote-sources', { ...payload, organizationId: 'other-org' }))).status, 403);
    assert.equal((await extractSources(request('/api/ai/quote-sources', payload, ''))).status, 401);
    assert.equal((await extractSources(request('/api/ai/quote-sources', { ...payload, sources: [{ name: 'plan', image: 'http://internal/image.jpg' }] }))).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});

test('lecture vision : traite les 6 images en groupes de 3 et préserve la dictée complémentaire', async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b');
    assert.equal(body.messages[1].content.filter((item: { type: string }) => item.type === 'image_url').length, 3);
    assert.match(body.messages[0].content, /N'estime jamais une dimension/);
    calls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({sources:[0,1,2].map(source_index=>({source_index,kind:'context',reference:'',rows_complete:true,rows:[],observations:`Source ${calls} : plafond à repeindre. Dimensions inconnues.`,subtotal:null,subtotal_scope:'unknown'}))}) }, finish_reason: 'stop' }] });
  };
  try {
    const sources = validateQuoteSources(Array.from({ length: 6 }, (_, index) => ({ name: `photo${index}.jpg`, image: `data:image/jpeg;base64,/9j/AA${index}=` })));
    const result = await readQuoteSources(sources);
    assert.equal(calls, 2);
    assert.match(result, /Source 1/); assert.match(result, /Source 2/);
    assert.match(quoteSourceRequest('Client Bazin. 100 m² à 23 euros HT.', result), /Client Bazin\. 100 m² à 23 euros HT/);
    assert.throws(() => validateQuoteSources(Array.from({length:13}, () => sources[0])), /1 à 12/);
    assert.throws(() => validateQuoteSources([{ name: 'long.txt', text: 'a'.repeat(10_001) }]), /volumineux/);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'Texte tronqué' }, finish_reason: 'length' }] });
    await assert.rejects(readQuoteSources([sources[0]]), /trop longue/);
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey; }
});

test('PDF FAC-2026-004 : aucun libellé dans la colonne quantité, descriptions longues paginées et totaux conservés', async () => {
  const workspace = seedMobileWorkspace();
  const items = [{ ...workspace.invoices[0].items[0], label: 'Préparation et mise en peinture de l’ensemble des plafonds de votre habitation', description: 'Protection des sols et préparation des supports. '.repeat(210), quantity: 100, unit: 'm²', unitPrice: 23, taxRate: 10 }];
  const document = { ...workspace.invoices[0], number: 'FAC-2026-004', items, notes: 'Note client à conserver.', ...calculateTotals(items) };
  const blob = await buildBusinessDocumentPdf({ document, customer: workspace.customers[0], company: { displayName: 'CHAPET Père et Fils' }, profile: null });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    assert.ok(pdf.numPages > 1);
    const contents: string[] = [];
    let designationLines = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        contents.push(item.str);
        const x = item.transform[4] / (72 / 25.4);
        if (Math.abs(x - 18) < 0.2 && item.transform[5] < 700 && !['Désignation'].includes(item.str)) {
          designationLines++;
          assert.ok(x + item.width / (72 / 25.4) <= 101, `Designation exceeds column: ${item.str}`);
          assert.ok(item.transform[5] > 80, 'Body text must remain above footer');
        }
      }
    }
    assert.ok(designationLines > 20);
    const text = contents.join(' ');
    assert.match(text, /2 300,00 €/); assert.match(text, /230,00 €/); assert.match(text, /2 530,00 €/);
    assert.match(text, /Note client à conserver/);
    await mkdir('tmp/pdfs', { recursive: true });
    await writeFile('tmp/pdfs/philippe-invoice-layout.pdf', Buffer.from(await blob.arrayBuffer()));
  } finally { await task.destroy(); }
});

const sendEmail = authenticatedRoute(sendEmailHandler, false);
const extractSources = authenticatedRoute(extractSourcesHandler, false);
