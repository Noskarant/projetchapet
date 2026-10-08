import {getActiveOrganizationId} from './project-chapet';
import {supabase} from './supabase';
import {changeCustomerPortal, normalizeCustomerPortals, type CustomerPortalContext} from './customer-portals';

export async function loadCustomerPortals(customerId: string) {
  const organizationId = await getActiveOrganizationId();
  const {data, error} = await supabase.from('customers').select('portal_links,updated_at')
    .eq('organization_id', organizationId).eq('id', customerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Ce client est indisponible.');
  return {organizationId, updatedAt: String(data.updated_at), links: normalizeCustomerPortals(data.portal_links)};
}

export async function saveCustomerPortal(customerId: string, context: CustomerPortalContext, url: string) {
  // Only this link changes. Retry a concurrent customer edit without overwriting it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await loadCustomerPortals(customerId);
    const links = changeCustomerPortal(current.links, context, url);
    const {data, error} = await supabase.from('customers').update({portal_links: links})
      .eq('organization_id', current.organizationId).eq('id', customerId).eq('updated_at', current.updatedAt).select('id').maybeSingle();
    if (error) throw error;
    if (data) return links;
  }
  throw new Error('La fiche client a changé. Réessayez d’enregistrer le lien.');
}
