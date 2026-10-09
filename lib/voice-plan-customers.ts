import type { SupabaseClient } from '@supabase/supabase-js';
import { plannedActionFromParsed, type PlannedAction } from './action-planner';
import { artisanInstructions, hasDistinctWorksite, requestedBillTo, sourceInsuredName } from './document-parties';

const key = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const personKey = (value: unknown) => key(value).replace(/^(?:le |la )?(?:m|mme|monsieur|madame)\s+/u, '');
function names(customer: Record<string, unknown>) {
  return customer.kind === 'business' ? [key(customer.company_name)]
    : [personKey([customer.first_name, customer.last_name].filter(Boolean).join(' ')),
      personKey([customer.last_name, customer.first_name].filter(Boolean).join(' '))];
}
const named = (customer: Record<string, unknown>, hint: unknown) => names(customer).includes(personKey(hint));

export function voiceCustomerMatches(customers: Record<string, unknown>[], hint: unknown) {
  const wanted = personKey(hint);
  if (!wanted) return [];
  const exact = customers.filter(customer => named(customer, wanted));
  if (exact.length) return exact;
  const words = wanted.split(' ').sort();
  const reordered = customers.filter(customer => names(customer).some(name => name.split(' ').sort().join(' ') === words.join(' ')));
  if (reordered.length) return reordered;
  const partial = customers.filter(customer => names(customer).some(name => {
    const candidate = name.split(' ');
    return words.every(word => candidate.includes(word));
  }));
  if (partial.length) return partial;
  // Two complete name tokens are necessary for a small transcription repair.
  // A surname alone must never fuzzy-match another person's surname.
  if (words.length < 2 || words.some(word => word.length < 3)) return [];
  return customers.filter(customer => names(customer).some(name => {
    const tokens = name.split(' ').sort();
    return tokens.length === words.length && tokens.every((token, index) => nameDistance(token, words[index]) <= 1);
  }));
}

function nameDistance(a: string, b: string) {
  let row = Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;
  }
  return row[b.length];
}
export function billToCustomerMatches(customers: Record<string, unknown>[], hint: string) {
  const exact=customers.filter(customer=>named(customer,hint));if(exact.length)return exact;
  const compact=(value:string)=>key(value).replace(/\b(?:immobilier|immobiliere|sarl|sas|sasu|societe)\b/gu,'').replace(/\s/g,'');
  const wanted=compact(hint);if(wanted.length<8||wanted.length>180)return [];
  // A unique close name can repair a transcription (Cytia/Citya); similar
  // unrelated people must remain ambiguous and require clarification.
  return customers.filter(customer=>names(customer).some(name=>{const candidate=compact(name);return candidate.length>=8&&nameDistance(candidate,wanted)/Math.max(candidate.length,wanted.length)<=0.23;}));
}

export async function readVoicePlanCustomers(organizationId: string, client: SupabaseClient) {
  const { data, error } = await client.from('customers').select('id,kind,company_name,civility,last_name,first_name,siret,vat_number,emails,phones,addresses,notes')
    .eq('organization_id', organizationId).limit(500);
  if (error) throw new Error('Recherche des clients impossible.');
  return (data || []) as Record<string, unknown>[];
}

export async function resolveVoicePlanCustomers(actions: PlannedAction[], organizationId: string, client: SupabaseClient, knownCustomers?: Record<string, unknown>[]) {
  if (!actions.some(action => ['create_customer', 'create_project', 'prepare_quote', 'prepare_invoice'].includes(action.intentType))) return;
  const customers = knownCustomers ?? await readVoicePlanCustomers(organizationId, client);
  for(const action of actions){
    if(!['create_customer','prepare_quote','prepare_invoice','create_project'].includes(action.intentType))continue;
    const billTo=requestedBillTo(action.rawText);
    if(!billTo||!hasDistinctWorksite(action.rawText) && actions.filter(a=>['prepare_quote','prepare_invoice'].includes(a.intentType)).length !== 1)continue;
    const matches=voiceCustomerMatches(customers,billTo);
    const resolvedMatches=matches.length ? matches : billToCustomerMatches(customers,billTo);
    if(resolvedMatches.length>1){action.missingFields.push('client_ambigu');action.status='needs_input';continue;}
    if(action.intentType==='create_customer'){
      const existing=resolvedMatches[0];
      if(existing){
        // Reusing the payer must not copy the occupant's phone/address to it.
        const replacement=plannedActionFromParsed('customer',{...existing,existing_customer_id:existing.id},action.rawText);
        action.payload={...replacement.payload,existing_customer_id:existing.id};
        action.missingFields = action.missingFields.filter(field => !['nom_client','raison_sociale','client_a_confirmer','client'].includes(field));
      }else if(action.payload.company_name || /\b(?:agence|syndic|cabinet|entreprise|societe|société)\b/iu.test(billTo)){
        const replacement=plannedActionFromParsed('customer',{kind:'business',company_name:billTo,emails:[],phones:[],addresses:[],notes:''},action.rawText);
        action.payload=replacement.payload;
      }else if(!named(action.payload,billTo)){
        action.missingFields.push('client_a_confirmer');action.status='needs_input';
      }
    }else{
      action.payload.customer_hint=resolvedMatches[0]?.company_name||billTo;
      action.payload.customer_id=resolvedMatches[0]?.id||null;
      action.payload.customer_from_proposal_id=null;
      action.customerFromPosition=undefined;
      action.payload.customer_from_position=null;
    }
  }
  for (const action of actions) {
    if (action.intentType !== 'create_customer') continue;
    const email = Array.isArray(action.payload.emails) ? action.payload.emails[0] : '';
    const identifiers = customers.filter(customer => action.payload.siret && customer.siret === action.payload.siret
      || email && Array.isArray(customer.emails) && customer.emails.includes(email)
    );
    const matches = identifiers.length ? identifiers : [...new Map(names(action.payload).filter(Boolean).flatMap(name => voiceCustomerMatches(customers, name)).map(customer => [customer.id,customer])).values()];
    if (matches.length === 1) {
      action.payload.existing_customer_id = matches[0].id;
      action.missingFields = action.missingFields.filter(field => !['nom_client','raison_sociale','client_a_confirmer','client'].includes(field));
    }
    if (matches.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; }
  }
  for (const action of [...actions]) {
    if (!['create_project', 'prepare_quote', 'prepare_invoice'].includes(action.intentType)
      || action.payload.customer_id || !action.payload.customer_hint) continue;
    const wanted = personKey(action.payload.customer_hint);
    const matches = voiceCustomerMatches(customers, wanted);
    if (matches.length === 1) {
      action.payload.customer_id = matches[0].id;
      action.customerFromPosition = undefined;
      action.payload.customer_from_position = null;
      action.payload.customer_from_proposal_id = null;
      action.missingFields = action.missingFields.filter(field=>!['client','client_a_confirmer','client_introuvable'].includes(field));
      continue;
    }
    if (matches.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; continue; }
    if (action.customerFromPosition !== undefined) continue;
    const planned = actions.flatMap((customer, index) => customer.intentType === 'create_customer' && named(customer.payload, wanted) ? [index] : []);
    if (planned.length === 1) { action.customerFromPosition = planned[0]; continue; }
    if (planned.length > 1) { action.missingFields.push('client_ambigu'); action.status = 'needs_input'; continue; }
    if (/\b(?:déjà (?:dans|enregistré|créé|existant)|client existant|reprenons|reprends? le client)\b/iu.test(artisanInstructions(action.rawText))) {
      action.missingFields.push('client_introuvable'); action.status = 'needs_input'; continue;
    }
    // An imported model hint must be an identity actually present in the dossier.
    // Never create a business called ‘les travaux décrits dans les sources’.
    if (action.rawText.includes('Informations issues des sources à vérifier') && !key(action.rawText.split('Informations issues des sources à vérifier')[1]).includes(wanted) && !key(artisanInstructions(action.rawText)).includes(wanted)) {
      action.missingFields.push('client_a_confirmer'); action.status = 'needs_input'; continue;
    }
    const hint = String(action.payload.customer_hint).trim();
    const insured = personKey(sourceInsuredName(action.rawText)) === personKey(hint);
    const individual = /^(?:M\.?|Mme|Monsieur|Madame)\s+/iu.test(hint) || insured;
    const created = plannedActionFromParsed('customer', individual
      ? { kind: 'individual', civility: /^(?:Mme|Madame)\b/iu.test(hint) ? 'Mme' : /^(?:M\.?|Monsieur)\s/iu.test(hint) ? 'M.' : null, ...(insured ? insuredContacts(action.rawText) : {}), last_name: hint.replace(/^(?:M\.?|Mme|Monsieur|Madame)\s+/iu, '') }
      : { kind: 'business', company_name: hint }, action.rawText);
    action.customerFromPosition = actions.length;
    actions.push(created);
  }
}

/** Only labelled contacts of a unique insured can fill a missing client proposal. */
function insuredContacts(transcript: string) {
  const source = (transcript.split('Informations issues des sources à vérifier')[1] || '').replace(/[*_]/g, '');
  const phone = source.match(/(?:^|\n)\s*(?:Téléphone|Tél[.]?)\s+(?:de l['’])?assuré\s*:\s*([^\n;]+)/iu)?.[1]?.trim();
  const email = source.match(/(?:^|\n)\s*(?:E-?mail|Courriel)\s+(?:de l['’])?assuré\s*:\s*([^\n;]+)/iu)?.[1]?.trim();
  const address = source.match(/(?:^|\n)\s*Adresse (?:de l['’])?assuré\s*:\s*([^\n;]+)/iu)?.[1]?.trim()
    || source.match(/(?:^|\n)\s*Adresse du sinistre\s*:\s*([^\n;]+)/iu)?.[1]?.trim();
  const parts = address?.match(/^(.*?)[, ]+([0-9]{5})\s+(.+)$/u);
  return {phones: phone ? [phone] : [], emails: email ? [email] : [], addresses: address ? [{line1: parts?.[1]?.trim() || address, postal_code: parts?.[2] || '', city: parts?.[3] || ''}] : []};
}
