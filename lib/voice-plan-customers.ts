import type { SupabaseClient } from '@supabase/supabase-js';
import { plannedActionFromParsed, type PlannedAction } from './action-planner';

const key = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const personKey = (value: unknown) => key(value).replace(/^(?:m|mme|monsieur|madame)\s+/u, '');
function names(customer: Record<string, unknown>) {
  return customer.kind === 'business' ? [key(customer.company_name)]
    : [personKey([customer.first_name, customer.last_name].filter(Boolean).join(' ')),
      personKey([customer.last_name, customer.first_name].filter(Boolean).join(' '))];
}
const named = (customer: Record<string, unknown>, hint: unknown) => names(customer).includes(personKey(hint));

export async function resolveVoicePlanCustomers(actions: PlannedAction[], organizationId: string, client: SupabaseClient) {
  if (!actions.some(action => ['create_customer', 'create_project', 'prepare_quote', 'prepare_invoice'].includes(action.intentType))) return;
  const { data, error } = await client.from('customers').select('id,kind,company_name,civility,last_name,first_name,siret,emails')
    .eq('organization_id', organizationId).limit(500);
  if (error) throw new Error('Recherche des clients impossible.');
  const customers = data || [];
  for (const action of actions) {
    if (action.intentType !== 'create_customer') continue;
    const email = Array.isArray(action.payload.emails) ? action.payload.emails[0] : '';
    const matches = customers.filter(customer => action.payload.siret && customer.siret === action.payload.siret
      || email && customer.emails?.includes(email)
      || customer.kind === action.payload.kind && names(customer).some(candidate => candidate && names(action.payload).includes(candidate)));
    if (matches.length === 1) action.payload.existing_customer_id = matches[0].id;
    if (matches.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; }
  }
  for (const action of [...actions]) {
    if (!['create_project', 'prepare_quote', 'prepare_invoice'].includes(action.intentType)
      || action.customerFromPosition !== undefined || action.payload.customer_id || !action.payload.customer_hint) continue;
    const wanted = personKey(action.payload.customer_hint);
    const planned = actions.flatMap((customer, index) => customer.intentType === 'create_customer' && named(customer.payload, wanted) ? [index] : []);
    if (planned.length === 1) { action.customerFromPosition = planned[0]; continue; }
    if (planned.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; continue; }
    const exact = customers.filter(customer => named(customer, wanted));
    const matches = exact.length ? exact : customers.filter(customer => {
      return names(customer).some(candidate => wanted.length >= 3 && candidate.length >= 3 && (candidate.includes(wanted) || wanted.includes(candidate)));
    });
    if (matches.length === 1) { action.payload.customer_id = matches[0].id; continue; }
    if (matches.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; continue; }
    const hint = String(action.payload.customer_hint).trim();
    const individual = /^(?:M\.?|Mme|Monsieur|Madame)\s+/iu.test(hint);
    const created = plannedActionFromParsed('customer', individual
      ? { kind: 'individual', civility: /^(?:Mme|Madame)\b/iu.test(hint) ? 'Mme' : 'M.', last_name: hint.replace(/^(?:M\.?|Mme|Monsieur|Madame)\s+/iu, '') }
      : { kind: 'business', company_name: hint }, action.rawText);
    action.customerFromPosition = actions.length;
    actions.push(created);
  }
}
