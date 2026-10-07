import { consumeAiQuota } from "@/lib/ai-authorization";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from '@/lib/api-guard';
import { authenticateRequest, requireOrganization } from '@/lib/server-auth';
import { validateQuoteSources } from '@/lib/quote-source-validation';
import { readQuoteSources } from '@/lib/quote-source-reader';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(request: Request) {
  const limited = rateLimit(request, 'quote-sources', 10);
  if (limited) return limited;
  try {
    const body = await readJsonBody<{ organizationId?: unknown; sources?: unknown }>(request, 4_000_000);
    if (typeof body.organizationId !== 'string') throw new ApiInputError('Entreprise manquante.');
    const context = await authenticateRequest(request);
    requireOrganization(context, body.organizationId, ['owner', 'admin', 'office', 'manager']);
    await consumeAiQuota(context.user.id, body.organizationId);
    const sources = validateQuoteSources(body.sources);
    const observations = await readQuoteSources(sources);
    return Response.json({ observations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error, 'Lecture des documents impossible.'); }
}
