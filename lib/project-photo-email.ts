import { supabase } from './supabase';
import { getActiveOrganizationId } from './project-chapet';
import { isClientEmailAddress, documentEmailErrorMessage } from './authenticated-email';

export async function sendProjectPhotoEmail(projectId: string, photoIds: string[], to: string, content: string, requestId: string) {
  if (!isClientEmailAddress(to)) throw new Error('Renseignez une adresse e-mail valide pour le dossier photo.');
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Votre session a expiré. Reconnectez-vous avant l’envoi.');
  // Cloud synchronization can still be uploading a just-added photo. Only retry
  // the explicit "not synchronized" response, never an ambiguous provider error.
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch('/api/projects/photo-report', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId, projectId, photoIds, to: to.trim(), content, requestId }) });
    if (response.ok) return;
    const result = await response.clone().json().catch(() => ({}));
    if (response.status !== 409 || result.code !== 'photos_sync_pending' || attempt === 11) throw new Error(await documentEmailErrorMessage(response));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
