import { createServiceSupabase } from './server-organization';
import { normalizeCompanyProfile } from './company-profile';
import { accountingInvoicePdf } from './accounting-invoice-pdf';
import { resolveManufeoSender } from './resend-email';
import { isEmail } from './api-guard';
import { transmitOrganizationInvoice } from './einvoice/transmit-invoice';
import { superPdpConfiguration } from './einvoice/superpdp';
import { getEInvoiceProviderConnection } from './einvoice/server';
import type { Invoice } from './project-chapet';
export async function runAutomaticInvoiceDelivery(organizationId: string) {
 const admin=createServiceSupabase();
 const {data:snapshot,error:snapshotError}=await admin.from('pilot_workspace_snapshots').select('company_profile').eq('organization_id',organizationId).maybeSingle();
 if(snapshotError)throw new Error('Paramètres de facturation indisponibles.');
 const profile=normalizeCompanyProfile(snapshot?.company_profile);
 const copy=profile.automaticAccountantCopyEnabled && isEmail(profile.accountingEmail) && !!process.env.RESEND_API_KEY;
 const pdp=profile.automaticPdpEnabled && superPdpConfiguration().configured && !!await getEInvoiceProviderConnection(organizationId);
 if(!copy&&!pdp)return {processed:0, outcomes:[], enabled:false};
 const {data:rows,error}=await admin.from('invoices').select('*,customer:customers(*),items:invoice_items(*)').eq('organization_id',organizationId).neq('status','draft').or('status.neq.cancelled,total.lt.0').order('issue_date',{ascending:false});
 if(error)throw new Error('Factures indisponibles.');
 const {data:existing,error:attemptError}=await admin.from('invoice_delivery_attempts').select('invoice_id,channel,status').eq('organization_id',organizationId);
 if(attemptError)throw new Error('Journal d’envoi indisponible.');
 const outcomes:Array<{invoiceNumber:string;channel:string;status:string}>=[];
 let processed=0;
 for(const invoice of (rows||[]) as unknown as Invoice[]){
  for(const channel of (['accountant','pdp'] as const)){
   if(channel==='accountant'&&!copy||channel==='pdp'&&!pdp)continue;
   const previous=existing?.find(row=>row.invoice_id===invoice.id&&row.channel===channel);
   if(previous&&previous.status!=='failed')continue;
   if(processed>=12)break;
   const row={organization_id:organizationId,invoice_id:invoice.id,invoice_number:invoice.number,channel,recipient:channel==='accountant'?profile.accountingEmail:null,status:'sending',message:'',updated_at:new Date().toISOString()};
   const reservation=previous?await admin.from('invoice_delivery_attempts').update(row).eq('organization_id',organizationId).eq('invoice_id',invoice.id).eq('channel',channel).eq('status','failed').select('invoice_id').maybeSingle():await admin.from('invoice_delivery_attempts').insert(row).select('invoice_id').single();
   if(reservation.error||!reservation.data)continue;
   processed++;let accepted=false,unknown=false;
   try{
    let providerId:string|null=null;
    if(channel==='pdp'){
     const result=await transmitOrganizationInvoice(organizationId,invoice.number);accepted=result.transmitted;providerId=result.providerInvoiceId;
    }else{
     const pdf=await accountingInvoicePdf(invoice,profile);
     const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`invoice-accountant/${organizationId}/${invoice.id}`},body:JSON.stringify({from:resolveManufeoSender(process.env.RESEND_FROM_EMAIL),to:[profile.accountingEmail],subject:`${invoice.number} — ${profile.displayName||profile.legalName}`,text:'Bonjour,\n\nVeuillez trouver la facture émise en pièce jointe.\n\nMANUFEO',attachments:[{filename:`${invoice.number}.pdf`,content:pdf.toString('base64')}]})});
     if(!response.ok)throw new Error(`E-mail refusé (${response.status}).`);accepted=true;
     const result=await response.json();if(typeof result.id!=='string')throw new Error('Envoi accepté, accusé manquant.');providerId=result.id;
    }
    const saved=await admin.from('invoice_delivery_attempts').update({status:'sent',provider_id:providerId,message:'',updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('invoice_id',invoice.id).eq('channel',channel);
    if(saved.error)throw new Error('Envoi accepté, journal à vérifier.');
    outcomes.push({invoiceNumber:invoice.number,channel,status:'sent'});
   }catch(error){
    unknown=accepted || error instanceof Error && /timeout|abort|fetch failed|transmission est en cours/i.test(error.message);
    const status=unknown?'unknown':'failed';
    await admin.from('invoice_delivery_attempts').update({status,message:(error instanceof Error?error.message:'Envoi impossible.').slice(0,500),updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('invoice_id',invoice.id).eq('channel',channel);
    outcomes.push({invoiceNumber:invoice.number,channel,status});
   }
  }
  if(processed>=12)break;
 }
 return {processed,outcomes,enabled:true};
}
