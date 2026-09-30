import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiInputError, isEmail } from './api-guard';
import { normalizeSupplierPayload } from './action-planner';

const identity = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Use the authenticated client: the existing organization RLS also applies here. */
export async function createSupplierFromVoice(client: SupabaseClient, organizationId: string, proposalId: string, payload: Record<string, unknown>) {
  const supplier = normalizeSupplierPayload(payload);
  if (!supplier.name) throw new ApiInputError('Le nom du fournisseur manque.', 409);
  if (supplier.email && !isEmail(supplier.email)) throw new ApiInputError('L’e-mail du fournisseur est invalide.', 409);
  const id = `voice-${proposalId}`;
  const { data: records, error: readError } = await client.from('artisan_workflow_records').select('id,payload').eq('organization_id', organizationId).eq('kind', 'supplier');
  if (readError) throw new Error('Vérification des fournisseurs impossible.');
  const existing = records?.find(row => row.id === id);
  // A retry after a lost acknowledgement must not overwrite a subsequently edited fiche.
  if (existing) return { id, name: String(existing.payload.name || supplier.name), duplicate: true };
  const duplicate = records?.find(row => identity(row.payload.name) === identity(supplier.name) || supplier.email && identity(row.payload.email) === identity(supplier.email));
  if (duplicate) throw new ApiInputError('Ce fournisseur existe déjà. Modifiez sa fiche dans Fournisseurs.', 409);
  const { error } = await client.from('artisan_workflow_records').upsert({ organization_id: organizationId, kind: 'supplier', id, payload: supplier, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,kind,id', ignoreDuplicates: true });
  if (error) throw new Error('Création du fournisseur impossible.');
  return { id, name: supplier.name, duplicate: false };
}
