import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProposalBatch, type ProposalRow } from '../lib/action-execution-server';
import type { AuthenticatedRequestContext } from '../lib/server-auth';
import { normalizeModelPlan } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';
import { voiceAgendaEntry } from '../lib/voice-action-history';

function fixture(intents = ['create_customer', 'prepare_quote', 'create_project', 'create_collaborator', 'create_supplier', 'schedule_task', 'prepare_invoice', 'prepare_email']) {
  const rows = intents.map((intent_type, i) => ({ id: `p${i}`, organization_id: 'org', created_by: 'user', source_type: 'voice', source_reference: 'batch', raw_text: 'Crée les fiches et brouillons', intent_type,
    status: 'ready', risk_level: ['prepare_invoice','prepare_email'].includes(intent_type) ? 'explicit_confirmation' : 'review', missing_fields: [], warnings: [], confidence: 0.9,
    payload: intent_type === 'create_customer' ? { kind: 'business', company_name: 'CROUS' }
      : intent_type === 'create_project' ? { name: 'Cuisine', customer_from_proposal_id: 'p0', quote_from_proposal_id: 'p1' }
      : intent_type === 'create_collaborator' ? { name: 'Lucas' }
      : intent_type === 'create_supplier' ? { name: 'Tollens' }
      : intent_type === 'prepare_email' ? { to: 'contact@example.test', subject: 'Devis', body: 'Bonjour' }
      : { customer_from_proposal_id: 'p0', items: [{ label: 'Peinture', quantity: 12, unit: 'm²', unit_price: 22.4, tax_rate: 10 }, { label: 'Papier peint', quantity: null, unit_price: null, tax_rate: 10 }] },
  })) as ProposalRow[];
  const saved: Record<string, unknown>[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      let mutation: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      let ids: string[] | undefined;
      const query = {
        select() { return query; }, eq(field: string, value: unknown) { filters.push([field,value]); return query; }, in(_field: string, value: string[]) { ids = value; return query; },
        upsert(value: Record<string, unknown>) { saved.push({ table, ...value }); return query; },
        update(value: Record<string, unknown>) { mutation=value; return query; },
        insert(value: Record<string, unknown>) { saved.push({ table, ...value }); return query; },
        async single() { return { data: { id: 'customer-id' }, error: null }; },
        async maybeSingle() {
          if (table === 'action_proposals') {
            const row = rows.find(row => filters.every(([field,value]) => row[field as keyof ProposalRow] === value));
            if (!row) return { data:null,error:null };
            if (mutation) Object.assign(row,mutation);
            return { data:{ id:row.id },error:null };
          }
          return { data:null,error:null };
        },
        then(resolve: (value: unknown) => void) { resolve({ data: ids ? rows.filter(row => ids!.includes(row.id)) : [], error:null }); },
      }; return query;
    },
    async rpc(name: string, args: Record<string, unknown>) { rpcCalls.push({ name,args }); return { data: name === 'save_quote_document' ? 'quote-id' : name === 'save_invoice_document' ? 'invoice-id' : args.p_project_id || args.p_collaborator_id || 'entity-id', error:null }; },
  };
  const context = { user: { id:'user' }, memberships:[{ organizationId:'org',role:'owner' }], client } as unknown as AuthenticatedRequestContext;
  return { rows,saved,rpcCalls,context };
}

test('exécution réelle du moteur : client, devis, chantier, équipe, fournisseur, agenda, facture et e-mail restent enregistrés sans envoi', async () => {
  const { rows,saved,rpcCalls,context } = fixture();
  const input = { context,organizationId:'org',proposalIds:rows.map(row => row.id),explicitConfirmation:false,directCreation:true };
  const result = await executeProposalBatch(input);
  assert.equal(result.results.length,8);
  assert.ok(rows.every(row => row.status === 'executed'));
  assert.equal(saved.filter(row => row.table === 'customers').length,1);
  const quote = rpcCalls.find(call => call.name === 'save_quote_document')!;
  assert.equal(quote.args.p_customer_id,'customer-id');
  assert.equal(quote.args.p_status,'draft');
  assert.equal((quote.args.p_items as Array<Record<string,unknown>>)[1].unit_price,null);
  const project = rpcCalls.find(call => call.name === 'create_commercial_project_from_voice')!;
  assert.equal(project.args.p_customer_id,'customer-id');
  assert.equal(project.args.p_quote_id,'quote-id');
  assert.equal(rpcCalls.find(call => call.name === 'save_invoice_document')!.args.p_status,'draft');
  assert.equal(result.results.at(-1)!.entityType,'email_draft');
  // Retrying after a lost HTTP response returns recorded results, not new entities.
  const count=rpcCalls.length;
  const replay=await executeProposalBatch(input);
  assert.deepEqual(replay.results,result.results);
  assert.equal(rpcCalls.length,count);
  assert.equal(saved.filter(row => row.table === 'customers').length,1);
});

test('le mode direct ne contourne ni les droits ni les validations d’un paiement réel', async () => {
  const { rows,context }=fixture(['mark_payment']);
  await assert.rejects(executeProposalBatch({ context,organizationId:'org',proposalIds:rows.map(row=>row.id),explicitConfirmation:false,directCreation:true }),/confirmation explicite/);
  context.memberships[0].role='collaborator';
  await assert.rejects(executeProposalBatch({ context,organizationId:'org',proposalIds:rows.map(row=>row.id),explicitConfirmation:true,directCreation:true }),/rôle/);
});

test('la franchise négative traverse réellement le moteur jusqu’aux RPC devis/facture, même avec 100 postes', async () => {
  const {rows,rpcCalls,context}=fixture(['create_customer','prepare_quote','prepare_invoice']);
  const items=Array.from({length:100},(_,index)=>({label:`Travaux ${index+1}`,quantity:1,unit:'forfait',unit_price:23,tax_rate:10}));
  const [quote]=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'CROUS',items}}]},'TVA 10 %. Travaux à 23 euros HT par poste. Franchise à récupérer 125 euros TTC.');
  rows[1].payload={...quote.payload,customer_from_proposal_id:'p0'};
  rows[2].payload={...quote.payload,customer_from_proposal_id:'p0'};
  await executeProposalBatch({context,organizationId:'org',proposalIds:rows.map(row=>row.id),explicitConfirmation:false,directCreation:true});
  for (const rpc of rpcCalls.filter(call=>['save_quote_document','save_invoice_document'].includes(call.name))) {
    const saved=rpc.args.p_items as Array<Record<string,unknown>>;
    assert.equal(saved.length,101); assert.equal(saved[100].unit_price,-113.64); assert.equal(saved[100].total,-113.64);
    assert.equal(saved[0].unit_price,23);
  }
});

test('PERBET et Bazin : les données normalisées arrivent réellement dans la sauvegarde et sont réutilisées au second appel', async () => {
  const { rows, saved, rpcCalls, context } = fixture(['create_customer', 'prepare_invoice', 'schedule_task']);
  rows[0].payload = { kind: 'individual', first_name: 'Henri', last_name: 'Perbet', addresses: [{ line1: '24 rue Montesquieu', postal_code: '42000', city: 'Saint-Étienne' }] };
  const [invoice] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: 'prepare_invoice', payload: { customer_hint: 'Henri Perbet', items: ['Portail extérieur', 'Préparation peinture', 'Antirouille finition'].map(label => ({ label, quantity: 1, unit: 'unité', unit_price: 700 })) } }] }, 'Portail extérieur, préparation peinture et antirouille de finition, une unité, 1 700 euros HT, TVA10%.'));
  rows[1].payload = { ...invoice.payload, customer_from_proposal_id: 'p0' };
  rows[2].payload = { title: 'Chantier Monsieur Bazin', date: '2026-10-05', time: '' };
  const input = { context, organizationId: 'org', proposalIds: rows.map(row => row.id), explicitConfirmation: false, directCreation: true };
  const result = await executeProposalBatch(input);
  const stored = rpcCalls.find(call => call.name === 'save_invoice_document')!;
  assert.equal(stored.args.p_customer_id, 'customer-id');
  assert.equal(stored.args.p_status, 'draft');
  const items = stored.args.p_items as Array<Record<string, unknown>>;
  assert.equal(items.length, 1);
  assert.equal(items[0].unit_price, 1700);
  assert.equal(items[0].tax_rate, 10);
  assert.deepEqual(saved.find(row => row.table === 'customers')!.addresses, rows[0].payload.addresses);
  assert.ok(voiceAgendaEntry({ id: rows[2].id, payload: rows[2].payload, created_at: '2026-10-03' }, []));
  assert.equal(result.results?.[2]?.entityType, 'agenda_event');
  assert.deepEqual((await executeProposalBatch(input)).results, result.results);
  assert.equal(rpcCalls.filter(call => call.name === 'save_invoice_document').length, 1);
});

test('unités abrégées et remise importée traversent la sauvegarde du devis', async () => {
  const { rows, saved, rpcCalls, context } = fixture(['create_customer','prepare_quote']);
  rows[1].payload = {customer_from_proposal_id:'p0',discount_percent:4,items:[{label:'Peinture',quantity:1.53,unit:'mètre carré',unit_price:22,tax_rate:10}]};
  await executeProposalBatch({context,organizationId:'org',proposalIds:rows.map(row=>row.id),explicitConfirmation:false,directCreation:true});
  const stored=rpcCalls.find(call=>call.name==='save_quote_document')!.args.p_items as Array<Record<string,unknown>>;
  assert.equal(stored[0].unit,'m²');assert.equal(stored[0].quantity,1.53);assert.equal(stored[0].unit_price,22);
  const meta=saved.find(row=>row.table==='quote_private_meta');assert.equal(meta?.discount_percent,4);assert.equal(meta?.organization_id,'org');
});
