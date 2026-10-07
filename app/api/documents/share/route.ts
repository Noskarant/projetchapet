import { randomUUID } from 'node:crypto';
import { ApiInputError, errorResponse, rateLimit, readJsonBody, requireString } from '@/lib/api-guard';
import { authenticateRequest, requireOrganization } from '@/lib/server-auth';
import { createServiceSupabase } from '@/lib/server-organization';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const limited = rateLimit(request, 'document-share', 20);
  if (limited) return limited;
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 13_400_000);
    const organizationId = requireString(body.organizationId, 'Entreprise', 80);
    const number = requireString(body.number, 'Numéro du document', 80);
    if (body.kind !== 'quote' && body.kind !== 'invoice') throw new ApiInputError('Document invalide.');
    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ['owner', 'admin', 'office', 'manager']);
    const { data: document, error } = await context.client.from(body.kind === 'quote' ? 'quotes' : 'invoices')
      .select('id,number,customer:customers(phones)').eq('organization_id', organizationId).eq('number', number).maybeSingle();
    if (error) throw new Error('Vérification du document impossible.');
    if (!document) throw new ApiInputError('Enregistrez ce document avant de le partager.', 404);
    if (typeof body.content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.content)) throw new ApiInputError('PDF invalide.');
    const bytes = Buffer.from(body.content, 'base64');
    if (bytes.length > 10_000_000 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new ApiInputError('PDF invalide ou trop volumineux.');
    const admin = createServiceSupabase();
    const path = `${organizationId}/${document.id}/${randomUUID()}/${number.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`;
    const bucket = admin.storage.from('document-shares');
    const uploaded = await bucket.upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploaded.error) throw new Error('Préparation du lien PDF impossible.');
    const signed = await bucket.createSignedUrl(path, 7 * 24 * 60 * 60);
    if (signed.error || !signed.data) { await bucket.remove([path]); throw new Error('Préparation du lien PDF impossible.'); }
    const customer = Array.isArray(document.customer) ? document.customer[0] : document.customer;
    return Response.json({ url: signed.data.signedUrl, phone: customer?.phones?.[0] || '', expiresInDays: 7 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error, 'Partage du document indisponible. Réessayez.'); }
}
