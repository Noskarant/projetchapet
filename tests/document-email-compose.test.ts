import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/email/route';
import { documentEmailRecipients } from '../lib/document-email-recipients';
import { plainDocumentEmailHtml, buildClassicDocumentEmail } from '../lib/document-email-template';

test('destinataires : adresses séparées, dédoublonnées et validées avant envoi', () => {
  assert.deepEqual(documentEmailRecipients('Client@Example.fr, autre@example.fr; client@example.fr'), ['client@example.fr', 'autre@example.fr']);
  assert.deepEqual(documentEmailRecipients(['client@example.fr', 'autre@example.fr']), ['client@example.fr', 'autre@example.fr']);
  for (const value of ['', 'client@example.fr, invalide', ['client@example.fr', 2], Array.from({ length: 6 }, (_, index) => `${index}@example.fr`)]) {
    assert.throws(() => documentEmailRecipients(value));
  }
});

test('message éditable : texte existant conservé, caractères HTML affichés sans balisage injecté', () => {
  const message = 'Bonjour,\n\nVeuillez trouver votre devis DEV-2026-020 en pièce jointe.\n\nCordialement,\nEntreprise Test';
  assert.equal(buildClassicDocumentEmail(plainDocumentEmailHtml(message)).text, message);
  const escaped = plainDocumentEmailHtml('Texte <script>alert(1)</script> & "devis"');
  assert.ok(!escaped.includes('<script>'));
  assert.match(escaped, /&lt;script&gt;/);
});

test('envoi préparé : plusieurs destinataires, copie cachée au compte vérifié et suivi du devis', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  const org = '11111111-1111-4111-8111-111111111111';
  let exists = true, accountEmail: string | undefined = 'artisan@example.fr', recorded = 0, requestId = 0;
  const deliveries: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: '22222222-2222-4222-8222-222222222222', email: accountEmail });
    if (url.includes('/organization_members')) return Response.json([{ organization_id: org, role: 'owner' }]);
    if (url.includes('/pilot_workspace_snapshots')) return Response.json([]);
    if (url.includes('/quotes')) {
      if (init?.method === 'PATCH' || input instanceof Request && input.method === 'PATCH') { recorded++; return Response.json({ id: 'quote-id' }); }
      return Response.json(exists ? [{ id: 'quote-id', organization_id: org, customer_id: 'client-id', number: 'DEV-2026-020', status: 'draft', sent_at: null }] : []);
    }
    if (url.includes('/customers')) return Response.json([{ id: 'client-id', emails: ['client@example.fr'] }]);
    if (url.includes('/organizations')) return Response.json([{ id: org, accountant_email: null }]);
    if (url.includes('api.resend.com')) { deliveries.push(JSON.parse(String(init?.body))); return Response.json({ id: 'sent-test' }); }
    throw new Error(`Unexpected request: ${url}`);
  };
  const message = 'Bonjour,\n\nVeuillez trouver votre devis DEV-2026-020 en pièce jointe.\n\nCordialement,\nEntreprise Test';
  const base = { documentNumber: 'DEV-2026-020', documentKind: 'quote', to: 'autre@example.fr, client@example.fr', customRecipient: true, copyToSelf: true, subject: 'Votre devis DEV-2026-020', html: plainDocumentEmailHtml(message), attachments: [{ filename: 'DEV-2026-020.pdf', content: Buffer.from('%PDF-1.7 test').toString('base64') }] };
  const send = (body: unknown, token = 'test-token') => POST(new Request('https://manufeo.fr/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `compose-${++requestId}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  try {
    const result = await send({ ...base, copyToSelfEmail: 'spoof@example.fr' });
    assert.equal(result.status, 200); assert.equal((await result.json()).quoteSentRecorded, true);
    assert.deepEqual(deliveries[0].to, ['autre@example.fr', 'client@example.fr']);
    assert.deepEqual(deliveries[0].bcc, ['artisan@example.fr']);
    assert.equal(deliveries[0].text, message); assert.equal(recorded, 1);
    assert.equal((await send({ ...base, copyToSelf: false, attachments: [{ ...base.attachments[0], filename: 'DEV-2026-020-sans-prix.pdf' }] })).status, 200);
    assert.deepEqual(deliveries[1].bcc, []); assert.equal(recorded, 1);
    assert.equal((await send({ ...base, customRecipient: false })).status, 403);
    assert.equal((await send({ ...base, to: 'client@example.fr, invalide' })).status, 400);
    assert.equal((await send(base, '')).status, 401);
    accountEmail = undefined;
    assert.equal((await send(base)).status, 400);
    exists = false;
    assert.equal((await send(base)).status, 404);
    assert.equal(deliveries.length, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
  }
});
