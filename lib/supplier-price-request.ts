import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiInputError, isEmail } from './api-guard';
import { resolveManufeoSender } from './resend-email';
import type { Supplier } from './artisan-records';
export type PriceRequest = { supplierId: string; requestId: string; label: string; quantity: number; unit: string; targetPrice?: number | null; notes?: string };
export async function sendSupplierPriceRequest(admin: SupabaseClient, organizationId: string, input: PriceRequest) {
  if (typeof input.requestId !== 'string' || typeof input.supplierId !== 'string' || input.supplierId.length > 180 || typeof input.label !== 'string' || typeof input.unit !== 'string' || input.unit.length > 40 || input.targetPrice != null && (!Number.isFinite(input.targetPrice) || input.targetPrice < 0) || !/^[0-9a-f-]{36}$/i.test(input.requestId) || !input.supplierId || !input.label.trim() || !Number.isFinite(input.quantity) || input.quantity <= 0) throw new ApiInputError('Fournisseur, désignation et quantité valides requis.');
  const { data: supplierRow, error } = await admin.from('artisan_workflow_records').select('payload').eq('organization_id', organizationId).eq('kind','supplier').eq('id',input.supplierId).single();
  const supplier = supplierRow?.payload as Supplier | undefined;
  if (error || !supplier || !isEmail(supplier.email)) throw new ApiInputError('Le fournisseur doit avoir une adresse e-mail valide.');
  if (!process.env.RESEND_API_KEY) throw new ApiInputError('Envoi e-mail indisponible.',503);
  const { error: reservation } = await admin.from('supplier_price_requests').insert({ organization_id: organizationId, id: input.requestId, supplier_id: input.supplierId, recipient: supplier.email, payload: input });
  if (reservation) {
    if (reservation.code !== '23505') throw new Error('Réservation de la demande impossible.');
    const { data: existing } = await admin.from('supplier_price_requests').select('status,provider_id,payload').eq('organization_id',organizationId).eq('id',input.requestId).single();
    if (!isDeepStrictEqual(existing?.payload, JSON.parse(JSON.stringify(input)))) throw new ApiInputError('Cette référence désigne une autre demande.',409);
    if (existing?.status === 'sent') return { sent: true, providerId: existing.provider_id, duplicate: true };
    if (existing?.status === 'sending') throw new ApiInputError('Cette demande est déjà en cours d’envoi.',409);
    const { data: claim, error: claimError } = await admin.from('supplier_price_requests').update({ status:'sending' }).eq('organization_id',organizationId).eq('id',input.requestId).eq('status','failed').select('id').maybeSingle();
    if (claimError || !claim) throw new ApiInputError('Envoi déjà en cours.',409);
  }
  let accepted = false;
  try {
    const { data: organization } = await admin.from('organizations').select('name').eq('id',organizationId).single();
    const response = await fetch('https://api.resend.com/emails',{ method:'POST', signal:AbortSignal.timeout(25000), headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json', 'Idempotency-Key':`supplier-price/${organizationId}/${input.requestId}` }, body:JSON.stringify({ from:resolveManufeoSender(process.env.RESEND_FROM_EMAIL),to:[supplier.email],subject:`Demande de prix — ${input.label.slice(0,140)}`,text:`Bonjour ${supplier.contact || supplier.name},\n\nMerci de nous adresser votre devis pour :\n${input.label}\nQuantité : ${input.quantity} ${input.unit || 'unités'}${Number.isFinite(input.targetPrice) && input.targetPrice !== null ? `\nPrix unitaire indicatif HT : ${input.targetPrice} €` : ''}\n${input.notes || ''}\n\nMerci de préciser vos tarifs, délais et conditions de livraison.\n\nCordialement,\n${organization?.name || 'Notre entreprise'}\n\nDemande de prix uniquement, sans commande ferme.` }) });
    const result = await response.json().catch(()=>({}));
    if (!response.ok || typeof result.id !== 'string') throw new Error('Le fournisseur e-mail n’a pas confirmé l’envoi.');
    accepted = true;
    const saved = await admin.from('supplier_price_requests').update({status:'sent',provider_id:result.id,sent_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',input.requestId);
    if (saved.error) throw new Error('Mail envoyé ; son accusé reste à synchroniser.');
    return {sent:true,providerId:result.id,duplicate:false};
  } catch (error) {
    if (!accepted && !(error instanceof Error && ['AbortError','TimeoutError','TypeError'].includes(error.name))) await admin.from('supplier_price_requests').update({status:'failed'}).eq('organization_id',organizationId).eq('id',input.requestId);
    throw error;
  }
}
