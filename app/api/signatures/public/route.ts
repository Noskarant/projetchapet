import { createHmac } from 'node:crypto';
import { ApiInputError, errorResponse, rateLimit, readJsonBody, requireString } from '@/lib/api-guard';
import { createServiceSupabase } from '@/lib/server-organization';
import { requireSignatureToken, signatureTokenHash } from '@/lib/quote-signature';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
 const limited=rateLimit(request,'public-signature-read',40);if(limited)return limited;
 try{
  const url=new URL(request.url),token=requireSignatureToken(url.searchParams.get('token'));
  const admin=createServiceSupabase();
  const loaded=await admin.from('quote_signature_requests').select('id,document_number,storage_path,status,expires_at,signed_at').eq('token_hash',signatureTokenHash(token)).maybeSingle();
  if(loaded.error)throw new Error('Lecture de la signature impossible.');
  const r=loaded.data;
  if(!r||r.status==='revoked')throw new ApiInputError('Lien de signature introuvable.',404);
  if(r.status!=='signed'&&Date.parse(r.expires_at)<=Date.now())throw new ApiInputError('Ce lien a expiré. Demandez un nouvel envoi à votre artisan.',410);
  if(url.searchParams.get('format')==='pdf'){
   const pdf=await admin.storage.from('document-shares').download(r.storage_path);
   if(pdf.error||!pdf.data)throw new Error('Lecture du devis impossible.');
   return new Response(pdf.data,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${r.document_number.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf"`}});
  }
  const signed=r.status==='signed'?await admin.from('document_signatures').select('signer_name,signer_email,signed_at,document_hash,consent_text').eq('signature_request_id',r.id).single():null;
  if(signed?.error)throw new Error('Preuve de signature indisponible.');
  if(url.searchParams.get('format')==='receipt'){
   if(!signed?.data)throw new ApiInputError('Le devis n’est pas encore signé.',409);
   const {jsPDF}=await import('jspdf');const pdf=new jsPDF();
   pdf.setFontSize(16);pdf.text('Bon pour accord',16,22);pdf.setFontSize(10);
   const lines=[`Devis ${r.document_number}`,`Signataire : ${signed.data.signer_name}`,`Adresse : ${signed.data.signer_email}`,`Date : ${new Date(signed.data.signed_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}`,signed.data.consent_text,`Empreinte SHA-256 du PDF : ${signed.data.document_hash}`];
   let y=36;for(const line of lines){const wrapped=pdf.splitTextToSize(line,178);pdf.text(wrapped,16,y);y+=wrapped.length*5+7;}
   return new Response(pdf.output('arraybuffer'),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="accord-${r.document_number.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf"`}});
  }
  return Response.json({number:r.document_number,status:r.status,expiresAt:r.expires_at,signature:signed?.data||null},{headers});
 }catch(error){return errorResponse(error,'Lien de signature indisponible.');}
}
export async function POST(request:Request){
 const limited=rateLimit(request,'public-signature-accept',10);if(limited)return limited;
 try{
  const body=await readJsonBody<Record<string,unknown>>(request,4000),token=requireSignatureToken(body.token),name=requireString(body.signerName,'Nom du signataire',200);
  if(name.length<2||body.consent!==true)throw new ApiInputError('Votre nom et votre accord explicite sont obligatoires.');
  const admin=createServiceSupabase();
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-real-ip')||'unknown';
  const secret=process.env.EINVOICE_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new ApiInputError('Service de signature indisponible.',503);
  const result=await admin.rpc('accept_quote_signature',{p_token_hash:signatureTokenHash(token),p_signer_name:name,p_ip_hash:createHmac('sha256',secret).update(ip).digest('hex'),p_user_agent:(request.headers.get('user-agent')||'').slice(0,500)});
  if(result.error){
   if(result.error.message.includes('quote_changed'))throw new ApiInputError('Ce devis a été modifié. Demandez une nouvelle version à votre artisan.',409);
   if(result.error.message.includes('quote_not_signable'))throw new ApiInputError('Ce devis n’est plus disponible pour signature.',409);
   if(result.error.message.includes('signature_link_'))throw new ApiInputError('Lien invalide ou expiré. Demandez un nouvel envoi à votre artisan.',410);
   throw new Error('Enregistrement de la signature impossible.');
  }
  return Response.json({signed:true},{headers});
 }catch(error){return errorResponse(error,'Signature impossible.');}
}
