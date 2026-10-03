import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProposalBatch, type ProposalRow } from '../lib/action-execution-server';
import type { AuthenticatedRequestContext } from '../lib/server-auth';

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
