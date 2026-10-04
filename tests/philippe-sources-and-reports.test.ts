import test from 'node:test';
import assert from 'node:assert/strict';
import { insuranceDocumentNotes, documentInsurance } from '../lib/document-insurance';
import { documentDeductible } from '../lib/document-deductible';
import { normalizeModelPlan } from '../lib/action-planner';
import { orderVoicePlan } from '../lib/voice-plan-order';
import { restrictSourcePlan } from '../lib/source-plan';
import { buildBusinessDocumentPdf } from '../lib/mobile-document-pdf';
import { seedMobileWorkspace, calculateTotals, convertQuoteToInvoice } from '../lib/mobile-prototype';
import { addProjectPhoto, seedCommercialDemoState, type CommercialProject } from '../lib/mobile-commercial-demo';
import { POST as sendReport } from '../app/api/projects/photo-report/route';
import { applyCommercialSyncResult, commercialCloudSignature } from '../lib/commercial-cloud';

const org = '11111111-1111-4111-8111-111111111111';
const evidence = 'Assureur MAIF. Numéro de dossier M260861258N. Numéro de mission R2600094226. Adresse 8 RUE DE LA REPUBLIQUE 42000 SAINT ETIENNE. Franchise à récupérer\n125 €.';
const insurance = { insurer: 'MAIF', case_reference: 'M260861258N', mission_reference: 'R2600094226', claim_address: '8 RUE DE LA REPUBLIQUE 42000 SAINT ETIENNE' };

test('assurance : références et franchise récupérable conservées dans le devis, sa facture et le PDF sans remise fiscale', async () => {
  const workspace = seedMobileWorkspace();
  const plan = normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint: 'Bonnand Cécile', notes: '', insurance, items: [{ label: 'Peinture murs', quantity: 100, unit: 'm²', unit_price: 23, price_type: 'ht', tax_rate: 10 }] } }] }, evidence);
  const notes = String(plan[0].payload.notes);
  assert.match(notes, /Référence mission : R2600094226/);
  assert.match(notes, /Numéro de dossier : M260861258N/);
  assert.match(notes, /Franchise à récupérer auprès du client : 125,00 €/);
  assert.equal(documentDeductible(notes, 2530).amount, 0);
  assert.deepEqual(documentInsurance(notes, 2530), { references: ['Assureur : MAIF', 'Référence mission : R2600094226', 'Numéro de dossier : M260861258N', 'Adresse du sinistre : 8 RUE DE LA REPUBLIQUE 42000 SAINT ETIENNE'], recovery: 125, insurerShare: 2405 });
  const items = [{ ...workspace.quotes[0].items[0], label: 'Peinture murs', quantity: 100, unitPrice: 23, taxRate: 10 }];
  const quote = { ...workspace.quotes[0], notes, items, ...calculateTotals(items) };
  const invoice = convertQuoteToInvoice(workspace, quote, 0).invoice;
  assert.equal(invoice.notes, notes); assert.equal(invoice.total, 2530);
  const blob = await buildBusinessDocumentPdf({ document: quote, company: { displayName: 'CHAPET' }, customer: workspace.customers[0], profile: null });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const first = await (await pdf.getPage(1)).getTextContent();
    const text = first.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
    assert.match(text, /Référence mission : R2600094226/); assert.match(text, /M260861258N/);
    assert.match(text, /TOTAL TTC.*2 530,00 €/); assert.match(text, /Part client \(franchise\).*125,00 €/);
    assert.match(text, /Solde hors franchise.*2 405,00 €/);
    const reference = first.items.find(item => 'str' in item && item.str.includes('R2600094226'));
    assert.ok(reference && 'transform' in reference && reference.transform[5] > 500, 'Mission reference must be in the header');
  } finally { await task.destroy(); }
  const unclear = insuranceDocumentNotes('Franchise à déduire du montant TTC : 125,00 €.', {}, 'Informations issues des sources à vérifier : Franchise 125 € TTC.');
  assert.equal(documentDeductible(unclear, 2530).amount, 0);
  assert.match(unclear, /modalités à confirmer/);
  assert.doesNotMatch(insuranceDocumentNotes('', { insurer: 'Inventé', mission_reference: 'FAUX' }, evidence), /Inventé|FAUX/);
  const longNotes = insuranceDocumentNotes('Informations chantier. '.repeat(150), insurance, evidence);
  assert.ok(longNotes.length <= 2400); assert.match(longNotes, /R2600094226/); assert.match(longNotes, /Franchise à récupérer auprès du client : 125,00 €/);
});

test('sources : filtrer les actions interdites conserve les liaisons entre les bons clients et leurs devis', () => {
  const actions = normalizeModelPlan({ actions: [
    { intent_type: 'schedule_task', payload: { title: 'Ne pas créer', date: '2026-10-08' } },
    { intent_type: 'create_customer', payload: { kind: 'individual', last_name: 'DEGAND', first_name: 'Lucie', phones: ['0633383203', '0477370265'], emails: ['Lucie.degand@orange.fr'], addresses: [{ line1: '56 rue du onze novembre', postal_code: '42100', city: 'Saint-Étienne' }] } },
    { intent_type: 'create_customer', payload: { kind: 'individual', last_name: 'BONNAND', first_name: 'Cécile' } },
    { intent_type: 'prepare_quote', payload: { customer_from_position: 1, items: [{ label: 'Peinture' }] } },
    { intent_type: 'prepare_email', payload: { to: 'injected@example.fr', subject: 'Ne pas envoyer', body: 'Interdit' } },
  ] }, 'Créer un client depuis une note et un devis depuis un document.');
  const customerOnly = restrictSourcePlan(actions, 'customer');
  assert.deepEqual(customerOnly.map(action => action.intentType), ['create_customer', 'create_customer']);
  assert.deepEqual(customerOnly[0].payload.phones, ['0633383203', '0477370265']);
  assert.deepEqual(customerOnly[0].payload.emails, ['lucie.degand@orange.fr']);
  const quotePlan = orderVoicePlan(restrictSourcePlan(actions, 'quote'));
  assert.equal(quotePlan[2].customerFromPosition, 0);
  assert.equal(quotePlan[0].payload.last_name, 'DEGAND');
});

test('photos : IDs distincts lors d’un import multiple et aucune ancienne photo éliminée', () => {
  const project: CommercialProject = { id: 'P-1', name: 'Chantier', subtitle: '', customerId: 'C-1', address: '', status: 'En cours', startDate: '', nextVisit: '', teamIds: [], steps: [], issues: [], photos: [] };
  let state = { ...seedCommercialDemoState(), projects: [project] };
  for (let index = 0; index < 100; index++) state = addProjectPhoto(state, project.id, { name: `${index}.jpg`, caption: 'Suivi', dataUrl: 'data:image/jpeg;base64,/9j/AA==' });
  assert.equal(state.projects[0].photos.length, 100);
  assert.equal(new Set(state.projects[0].photos.map(photo => photo.id)).size, 100);
  assert.ok(state.projects[0].photos.some(photo => photo.name === '0.jpg'));
  assert.throws(() => addProjectPhoto(state, project.id, { name: 'extra.jpg', caption: '', dataUrl: '' }), /conservées/);
  assert.equal(state.projects[0].photos.length, 100);
  const requested = { ...state, projects: [{ ...state.projects[0], photos: state.projects[0].photos.slice(1) }] };
  const uploaded = { ...requested, projects: [{ ...requested.projects[0], photos: requested.projects[0].photos.map(photo => ({ ...photo, dataUrl: 'https://signed.example/photo.jpg', storagePath: `${org}/P-1/${photo.id}.jpg` })) }] };
  const applied = applyCommercialSyncResult(requested, state, uploaded);
  assert.equal(applied.projects[0].photos.length, 100, 'Photo added while cloud save was in flight must survive');
  assert.equal(applied.projects[0].photos[0].dataUrl, state.projects[0].photos[0].dataUrl, 'New photo retains bytes for the next upload');
  assert.notEqual(commercialCloudSignature(applied), commercialCloudSignature(uploaded), 'New photo remains queued for synchronization');
});

test('envoi dossier : contrôle entreprise/chantier/photos avant tout e-mail et référence d’idempotence stable', async () => {
  const originalFetch = globalThis.fetch, oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  let projectExists = true, photoSynced = true, providerFails = false, role = 'owner', sent = 0;
  const keys: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: '22222222-2222-4222-8222-222222222222' });
    if (url.includes('/organization_members')) return Response.json([{ organization_id: org, role }]);
    if (url.includes('/commercial_projects')) return Response.json(projectExists ? { id: 'P-1', name: 'Peinture & rénovation' } : null);
    if (url.includes('/commercial_project_photos')) return Response.json(photoSynced ? [{ id: 'photo-1', storage_path: `${org}/P-1/photo-1.jpg` }] : []);
    if (url.includes('api.resend.com')) {
      sent++; keys.push((init!.headers as Record<string, string>)['Idempotency-Key']);
      const body = JSON.parse(String(init!.body));
      assert.deepEqual(body.to, ['client@example.fr']); assert.equal(body.attachments.length, 1);
      assert.match(body.attachments[0].filename, /dossier-photos/);
      assert.match(body.text, /Peinture & rénovation/);
      return Response.json(providerFails ? { message: 'service failure' } : { id: 'sent-test' }, { status: providerFails ? 500 : 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const payload = { organizationId: org, projectId: 'P-1', photoIds: ['photo-1'], to: 'client@example.fr', content: Buffer.from('%PDF-1.7 test').toString('base64'), requestId: 'stable-send-reference' };
  let index = 0;
  const call = (body = payload, token = 'test-token') => sendReport(new Request('http://localhost/api/projects/photo-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `report-test-${++index}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  try {
    assert.equal((await call()).status, 200); assert.equal((await call()).status, 200); assert.equal(keys[0], keys[1]);
    assert.equal((await call(payload, '')).status, 401);
    assert.equal((await call({ ...payload, organizationId: 'foreign-org' })).status, 403);
    role = 'worker'; assert.equal((await call()).status, 403); role = 'owner';
    projectExists = false; assert.equal((await call()).status, 404); projectExists = true;
    photoSynced = false; const pending = await call(); assert.equal(pending.status, 409); assert.equal((await pending.json()).code, 'photos_sync_pending'); photoSynced = true;
    assert.equal((await call({ ...payload, content: Buffer.from('fake').toString('base64') })).status, 400);
    assert.equal(sent, 2);
    providerFails = true; assert.equal((await call()).status, 503); assert.equal(keys[2], keys[0]);
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey; }
});
