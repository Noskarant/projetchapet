import { createServiceSupabase } from './server-organization';
import { normalizeCompanyProfile } from './company-profile';
import { buildVoiceEmailQuoteAttachment, type VoiceQuoteRecord, type VoiceQuoteCustomerRecord, type VoiceQuoteOrganizationRecord } from './voice-email-quote-pdf';
import { resolveManufeoSender } from './resend-email';
import { isEmail } from './api-guard';
import { quoteCanBeReminded, quoteReminderMessage } from './quote-reminders';

type ReminderQuote = VoiceQuoteRecord & { organization_id: string; sent_at: string | null; archived_at: string | null; accepted_at: string | null; signed_at: string | null; customer: VoiceQuoteCustomerRecord & { organization_id: string } };
type EmailPayload = { from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string; attachments: { filename: string; content: string }[] };

export async function runAutomaticQuoteReminders({ now = new Date(), dryRun = false } = {}) {
  const startedAt = Date.now();
  const admin = createServiceSupabase();
  const { data: due, error } = await admin.rpc('due_quote_reminders', { p_now: now.toISOString() });
  if (error) throw new Error('Lecture des devis à relancer impossible.');
  const outcomes: { quoteId: string; status: string }[] = [];
  for (const candidate of due ?? []) {
    if (Date.now() - startedAt > 240_000) break;
    const quoteId = String(candidate.id), orgId = String(candidate.organization_id);
    let reserved = false, attempted = false, providerAccepted = false;
    try {
      // Re-read status, settings and recipient just before each dispatch.
      const [quoteResult, snapshotResult, organizationResult, invoiceResult, journalResult] = await Promise.all([
        admin.from('quotes').select('*,customer:customers(*),items:quote_items(*)').eq('id', quoteId).eq('organization_id', orgId).maybeSingle(),
        admin.from('pilot_workspace_snapshots').select('company_profile').eq('organization_id', orgId).maybeSingle(),
        admin.from('organizations').select('id,name,siret,vat_number,phone,email,address').eq('id', orgId).maybeSingle(),
        admin.from('invoices').select('id').eq('organization_id', orgId).eq('quote_id', quoteId).neq('status','cancelled').limit(1),
        admin.from('quote_reminder_dispatches').select('*').eq('organization_id', orgId).eq('quote_id', quoteId).maybeSingle(),
      ]);
      if ([quoteResult,snapshotResult,organizationResult,invoiceResult,journalResult].some(result => result.error)) throw new Error('Vérification de la relance impossible.');
      const quote = quoteResult.data as ReminderQuote | null;
      const profile = normalizeCompanyProfile(snapshotResult.data?.company_profile);
      if (!quote || !organizationResult.data || !profile.automaticQuoteReminderEnabled || !quoteCanBeReminded(quote, now) || invoiceResult.data?.length) continue;
      if (!quote.customer || quote.customer.organization_id !== orgId || quote.customer.id !== quote.customer_id) throw new Error('Client du devis invalide.');
      if (!quote.items.length || quote.items.some(item => item.quantity == null || item.unit_price == null || item.tax_rate == null)) {
        outcomes.push({quoteId,status:'incomplete_quote'}); continue;
      }
      const recipient = quote.customer?.emails?.find(isEmail)?.trim().toLowerCase();
      if (!recipient) { outcomes.push({ quoteId, status: 'missing_email' }); continue; }
      const previous = journalResult.data;
      if (previous && (previous.status !== 'failed' || previous.attempts >= 3 || new Date(previous.next_attempt_at) > now)) continue;
      if (dryRun) { outcomes.push({ quoteId, status: 'due' }); continue; }
      const organization = organizationResult.data as VoiceQuoteOrganizationRecord;
      let payload: EmailPayload;
      if (previous) {
        // A retry must reuse the exact provider payload and recipient.
        payload = previous.payload as EmailPayload;
        if (!quote.customer.emails.some(email => email.trim().toLowerCase() === payload.to[0])) {
          await admin.from('quote_reminder_dispatches').update({status:'cancelled'}).eq('quote_id',quoteId).eq('status','failed');
          continue;
        }
      } else {
        const attachment = await buildVoiceEmailQuoteAttachment({quote, customer: quote.customer, organization, companyProfile: profile, recipient});
        const replyTo = profile.email || organization.email || '';
        payload = { from: resolveManufeoSender(process.env.RESEND_FROM_EMAIL), to: [recipient],
          ...quoteReminderMessage(quote.number, quote.title, profile.displayName || organization.name, replyTo),
          ...(isEmail(replyTo) ? { reply_to: replyTo } : {}), attachments: [{filename:attachment.filename,content:attachment.content}] };
      }
      const stamp = new Date().toISOString();
      if (previous) {
        const claim = await admin.from('quote_reminder_dispatches').update({status:'sending',attempts:previous.attempts+1,updated_at:stamp})
          .eq('quote_id',quoteId).eq('organization_id',orgId).eq('status','failed').eq('updated_at',previous.updated_at).select('quote_id').maybeSingle();
        if (claim.error) throw new Error('Réservation impossible.');
        if (!claim.data) continue;
      } else {
        const claim = await admin.from('quote_reminder_dispatches').insert({quote_id:quoteId,organization_id:orgId,status:'sending',payload,updated_at:stamp});
        if (claim.error?.code === '23505') continue;
        if (claim.error) throw new Error('Réservation impossible.');
      }
      reserved = true;
      attempted = true;
      const response = await fetch('https://api.resend.com/emails', {method:'POST', signal:AbortSignal.timeout(20_000),
        headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`quote-reminder/${quoteId}`},body:JSON.stringify(payload)});
      if (!response.ok) {
        // Definitive rejections may retry; an uncertain acceptance never retries
        // automatically beyond Resend's 24-hour idempotency window.
        const definitive = response.status >= 400 && response.status < 500;
        const saved = await admin.from('quote_reminder_dispatches').update({status:definitive?'failed':'uncertain',next_attempt_at:definitive?new Date(Date.now()+86_400_000).toISOString():null,updated_at:stamp}).eq('quote_id',quoteId).eq('organization_id',orgId).eq('status','sending');
        if (saved.error) throw saved.error;
        outcomes.push({quoteId,status:definitive?'failed':'uncertain'}); continue;
      }
      providerAccepted = true;
      const responseBody = await response.json();
      if (typeof responseBody.id !== 'string' || !responseBody.id) throw new Error('Accusé fournisseur manquant.');
      const sentAt = new Date().toISOString();
      const saved = await admin.from('quote_reminder_dispatches').update({status:'sent',provider_id:responseBody.id,sent_at:sentAt,updated_at:sentAt}).eq('quote_id',quoteId).eq('organization_id',orgId).eq('status','sending');
      if (saved.error) throw saved.error;
      outcomes.push({quoteId,status:'sent'});
    } catch {
      if (reserved) await admin.from('quote_reminder_dispatches').update({status:'uncertain',updated_at:new Date().toISOString()}).eq('quote_id',quoteId).eq('organization_id',orgId).eq('status','sending');
      outcomes.push({quoteId,status:providerAccepted?'accepted_unconfirmed':attempted?'uncertain':'preparation_failed'});
    }
  }
  return { dryRun, outcomes };
}
