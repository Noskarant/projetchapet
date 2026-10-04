import { createHash } from 'node:crypto';
import { ApiInputError, errorResponse, isEmail, readJsonBody, requireString, rateLimit } from '@/lib/api-guard';
import { authenticateRequest, requireOrganization } from '@/lib/server-auth';
import { buildClassicDocumentEmail } from '@/lib/document-email-template';
import { resolveManufeoSender, resendProviderErrorMessage } from '@/lib/resend-email';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 4_100_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiInputError('Demande invalide.');
    const organizationId = requireString(body.organizationId, 'Entreprise', 80);
    const projectId = requireString(body.projectId, 'Chantier', 160);
    const to = requireString(body.to, 'Destinataire', 254).toLowerCase();
    const requestId = requireString(body.requestId, 'Référence d’envoi', 80);
    if (!isEmail(to) || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw new ApiInputError('Destinataire ou référence d’envoi invalide.');
    if (!Array.isArray(body.photoIds) || !body.photoIds.length || body.photoIds.length > 100 || body.photoIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 160)) throw new ApiInputError('Sélection de photos invalide.');
    const photoIds = [...new Set(body.photoIds as string[])];
    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ['owner', 'admin', 'office', 'manager']);
    const { data: project, error: projectError } = await context.client.from('commercial_projects').select('id,name').eq('organization_id', organizationId).eq('id', projectId).maybeSingle();
    if (projectError) throw new Error('Chantier inaccessible');
    if (!project) throw new ApiInputError('Chantier introuvable dans votre entreprise.', 404);
    const { data: photos, error: photoError } = await context.client.from('commercial_project_photos').select('id,storage_path').eq('organization_id', organizationId).eq('project_id', projectId).in('id', photoIds);
    if (photoError) throw new Error('Photos inaccessibles');
    if (photos?.length !== photoIds.length || photos.some(photo => !photo.storage_path)) return Response.json({ code: 'photos_sync_pending', error: 'Les photos ne sont pas encore synchronisées. Réessayez dans quelques secondes.' }, { status: 409 });
    const limited = rateLimit(request, 'project-photo-email', 5);
    if (limited) return limited;
    const content = requireString(body.content, 'Dossier PDF', 4_000_000);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new ApiInputError('Dossier PDF invalide.');
    const bytes = Buffer.from(content, 'base64');
    if (bytes.length > 3_000_000) throw new ApiInputError('Dossier trop volumineux.', 413);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ApiInputError('Dossier PDF invalide.');
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new ApiInputError('Le service d’envoi n’est pas configuré.', 503);
    const name = String(project.name).slice(0, 220);
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const email = buildClassicDocumentEmail(`<p>Bonjour,</p><p>Veuillez trouver ci-joint le dossier de suivi photographique du chantier ${escape(name)} (${photoIds.length} photo${photoIds.length > 1 ? 's' : ''}).</p><p>Cordialement</p>`);
    const idempotency = createHash('sha256').update(`${organizationId}:${projectId}:${to}:${requestId}`).digest('hex');
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Idempotency-Key': `photo-report-${idempotency}` },
      body: JSON.stringify({ from: resolveManufeoSender(process.env.RESEND_FROM_EMAIL), to: [to], subject: `Dossier photos · ${name}`, ...email, attachments: [{ filename: `dossier-photos-${projectId.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`, content }] }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiInputError(resendProviderErrorMessage(response.status, result) || 'Envoi non confirmé. Réessayez avec le même dossier pour éviter un doublon.', 503);
    if (typeof result.id !== 'string' || !result.id) throw new ApiInputError('Le service n’a pas confirmé l’envoi. Réessayez avec le même dossier.', 503);
    return Response.json({ id: result.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error, 'Envoi du dossier photo impossible.'); }
}
