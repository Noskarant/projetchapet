import { documentSendPolicy } from './document-send-policy';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiInputError, isEmail } from './api-guard';
import { buildVoiceEmailQuoteAttachment, type VoiceQuoteRecord, type VoiceQuoteCustomerRecord, type VoiceQuoteOrganizationRecord } from './voice-email-quote-pdf';

export const signatureTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function requireSignatureToken(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ApiInputError('Lien de signature invalide.',404);
  return value;
}
export async function createQuoteSignatureRequest(admin: SupabaseClient, organizationId: string, number: string, recipient: string, origin: string) {
  if (!isEmail(recipient)) throw new ApiInputError('Adresse du signataire invalide.');
  const loaded = await admin.from('quotes').select('*,items:quote_items(*),customer:customers(*)').eq('organization_id',organizationId).eq('number',number).single();
  if (loaded.error || !loaded.data) throw new ApiInputError('Devis introuvable.',404);
  // Read the reference snapshot before loading the PDF data: a concurrent edit
  // must never pair an old PDF with a newer snapshot that could be accepted.
  const snapshot = await admin.rpc('quote_signature_snapshot',{p_quote_id:loaded.data.id});
  if(snapshot.error||!snapshot.data)throw new Error('Préparation de la signature impossible.');
  const refreshed = await admin.from('quotes').select('*,items:quote_items(*),customer:customers(*)').eq('organization_id',organizationId).eq('id',loaded.data.id).single();
  if(refreshed.error||!refreshed.data)throw new ApiInputError('Devis introuvable.',404);
  const quote = refreshed.data;
  if (!['draft','sent'].includes(quote.status)) throw new ApiInputError('Ce devis ne peut plus être envoyé pour signature.',409);
  if (!documentSendPolicy('quote', quote.items.map((item: Record<string, unknown>) => ({ quantity: item.quantity as number | null, unitPrice: item.unit_price as number | null, taxRate: item.tax_rate as number | null }))).canSign) throw new ApiInputError('Complétez les prestations avant la signature.',409);
  const customer = Array.isArray(quote.customer)?quote.customer[0]:quote.customer;
  if (!customer?.emails?.some((email: string)=>email.toLowerCase()===recipient.toLowerCase())) throw new ApiInputError('La signature doit être envoyée à une adresse enregistrée sur la fiche client.',403);
  const [org,profile,meta] = await Promise.all([
    admin.from('organizations').select('*').eq('id',organizationId).single(),
    admin.from('pilot_workspace_snapshots').select('company_profile').eq('organization_id',organizationId).maybeSingle(),
    admin.from('quote_private_meta').select('discount_percent').eq('organization_id',organizationId).eq('quote_number',number).maybeSingle(),
  ]);
  if (org.error||profile.error||meta.error) throw new Error('Préparation de la signature impossible.');
  const pdf = await buildVoiceEmailQuoteAttachment({quote:quote as VoiceQuoteRecord,customer:customer as VoiceQuoteCustomerRecord,organization:org.data as VoiceQuoteOrganizationRecord,
    companyProfile:profile.data?.company_profile,recipient,discountPercent:Number(meta.data?.discount_percent||0)});
  // Reject an edit that happened while the PDF was being generated.
  const after = await admin.rpc('quote_signature_snapshot',{p_quote_id:quote.id});
  if (after.error||JSON.stringify(after.data)!==JSON.stringify(snapshot.data)) throw new ApiInputError('Le devis a changé pendant la préparation. Réessayez.',409);
  const bytes=Buffer.from(pdf.content,'base64');
  const token=randomBytes(32).toString('hex');
  const path=`${organizationId}/${quote.id}/signature-${randomUUID()}/${pdf.filename}`;
  const bucket=admin.storage.from('document-shares');
  const upload=await bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(upload.error)throw new Error('Sauvegarde du devis à signer impossible.');
  const saved=await admin.from('quote_signature_requests').insert({organization_id:organizationId,quote_id:quote.id,token_hash:signatureTokenHash(token),signer_email:recipient.toLowerCase(),document_number:number,
    document_snapshot:snapshot.data,pdf_hash:createHash('sha256').update(bytes).digest('hex'),storage_path:path}).select('id').single();
  if(saved.error){await bucket.remove([path]);throw new Error('Création du lien de signature impossible.');}
  return {url:`${origin}/signer/${token}`,pdf};
}
