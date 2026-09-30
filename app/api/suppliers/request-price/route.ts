import { requireOrganization, requireRole, organizationErrorResponse } from '@/lib/server-organization';
import { errorResponse, rateLimit, readJsonBody } from '@/lib/api-guard';
import { sendSupplierPriceRequest, type PriceRequest } from '@/lib/supplier-price-request';
export async function POST(request: Request) {
 const limited = rateLimit(request,'supplier-price',12); if(limited)return limited;
 try {
  const context = await requireOrganization(request); requireRole(context.role,['owner','admin','office','manager']);
  const input = await readJsonBody<PriceRequest>(request,16000);
  if (typeof input.label !== 'string' || input.label.length > 1000 || typeof input.notes !== 'undefined' && (typeof input.notes !== 'string' || input.notes.length > 4000)) return Response.json({error:'Demande invalide.'},{status:400});
  return Response.json(await sendSupplierPriceRequest(context.admin,context.organizationId,input));
 }catch(error){return errorResponse(error,"Demande fournisseur impossible.");}
}
