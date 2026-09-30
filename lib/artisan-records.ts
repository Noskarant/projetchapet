import { supabase } from './supabase';
import { getActiveOrganizationId } from './project-chapet';
export type RecordKind = 'supplier' | 'collaborator_contact' | 'project_cost' | 'inbound_email';
export async function listArtisanRecords<T>(kind: RecordKind): Promise<Array<{ id: string; data: T }>> {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.from('artisan_workflow_records').select('id,payload').eq('organization_id', organizationId).eq('kind', kind).order('updated_at', { ascending: false });
  if (error) throw new Error('Chargement des données de votre entreprise impossible.');
  return (data || []).map(row => ({ id: String(row.id), data: row.payload as T }));
}
export async function saveArtisanRecord<T extends object>(kind: RecordKind, id: string, data: T) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from('artisan_workflow_records').upsert({ organization_id: organizationId, kind, id, payload: data, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,kind,id' });
  if (error) throw new Error('Enregistrement sécurisé impossible. Réessayez.');
}
export async function artisanRequest(url: string, body: object) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Reconnectez-vous pour continuer.');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Action impossible.');
  return result;
}
export type Supplier = { name: string; email: string; phone: string; address: string; contact: string; notes: string };
