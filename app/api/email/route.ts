import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ApiInputError,
  base64ByteLength,
  errorResponse,
  isEmail,
  optionalString,
  rateLimit,
  readJsonBody,
  requireString,
} from "@/lib/api-guard";
import { buildClassicDocumentEmail } from "@/lib/document-email-template";
import {
  recipientsAreAuthorized,
  snapshotAccountingEmails,
  snapshotRecipientsForDocument,
  uniqueValidEmails,
  type EmailDocumentKind,
} from "@/lib/email-authorization";
import { resendProviderErrorMessage, resolveManufeoSender } from "@/lib/resend-email";
import { supabasePublicConfig } from "@/lib/supabase-config";
import { documentEmailRecipients } from '@/lib/document-email-recipients';
import { authenticateRequest, requireOrganization } from '@/lib/server-auth';
import { createServiceSupabase, publicSiteUrl } from '@/lib/server-organization';
import { createQuoteSignatureRequest } from '@/lib/quote-signature';
import { automaticSmsConfigured, notifyQuoteEmailBySms, quoteEmailSmsMessage, smsMobileNumber } from '@/lib/quote-email-sms';

export const runtime = "nodejs";

type Attachment = { filename?: unknown; content?: unknown };
type EmailBody = {
  documentNumber?: unknown;
  documentKind?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  html?: unknown;
  attachments?: unknown;
  customRecipient?: unknown;
  copyToSelf?: unknown;
  requestSignature?: unknown;
  notifyBySms?: unknown;
};

function cleanEmails(value: unknown) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
  const emails = list.map((item) => String(item).trim()).filter(Boolean);
  if (emails.length > 5 || emails.some((item) => !isEmail(item))) {
    throw new ApiInputError("Adresse e-mail en copie invalide.");
  }
  return [...new Set(emails.map((email) => email.toLowerCase()))];
}

function cleanDocumentKind(value: unknown): EmailDocumentKind {
  if (value === "quote" || value === "invoice") return value;
  throw new ApiInputError("Type de document invalide.");
}

function normalizePdfBase64(value: string) {
  return value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
}

function hasPdfMagic(value: string) {
  const clean = normalizePdfBase64(value);
  if (clean.length < 8) return false;
  try {
    return Buffer.from(clean.slice(0, 16), "base64").subarray(0, 5).toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

function cleanAttachments(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiInputError("Un document PDF est requis pour l’envoi.");
  }
  if (value.length > 2) {
    throw new ApiInputError("Deux pièces jointes maximum sont autorisées.");
  }

  let totalBytes = 0;
  return value.map((raw) => {
    const attachment = raw as Attachment;
    const filename = requireString(attachment.filename, "Nom de fichier", 120)
      .replace(/[\\/:*?"<>|]/g, "-");
    const content = requireString(attachment.content, "Contenu de la pièce jointe", 11_000_000);
    totalBytes += base64ByteLength(content);
    if (totalBytes > 7_500_000) throw new ApiInputError("Pièces jointes trop volumineuses.", 413);
    if (!filename.toLowerCase().endsWith(".pdf") || !hasPdfMagic(content)) {
      throw new ApiInputError("Seuls les documents PDF valides peuvent être envoyés.");
    }
    return { filename, content: normalizePdfBase64(content) };
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8_000) throw new ApiInputError("Authentification requise.", 401);
  return match[1];
}

function authenticatedSupabase(token: string) {
  const { url, publishableKey } = supabasePublicConfig;

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authorizeRecipients(
  request: Request,
  documentNumber: string,
  documentKind: EmailDocumentKind,
  requestedRecipients: string[],
  customRecipient: boolean,
  toRecipients: string[],
) {
  const token = bearerToken(request);
  const client = authenticatedSupabase(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new ApiInputError("Votre session a expiré. Reconnectez-vous.", 401);

  const { data: memberships, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userData.user.id);
  if (membershipError) throw new Error("Organisation inaccessible");

  const organizationIds = [...new Set((memberships ?? []).map((row) => String(row.organization_id)).filter(Boolean))];
  if (!organizationIds.length) throw new ApiInputError("Aucune entreprise autorisée pour cet envoi.", 403);

  const allowed = new Set<string>();
  const snapshotAccountingByOrganization = new Map<string, string[]>();
  let documentFound = false;
  let sentQuote: { id: string; organization_id: string; sent_at: string | null } | null = null;

  const { data: snapshots, error: snapshotError } = await client
    .from("pilot_workspace_snapshots")
    .select("organization_id, workspace, company_profile")
    .in("organization_id", organizationIds);
  if (snapshotError) throw new Error("Espace de travail inaccessible");

  for (const snapshot of snapshots ?? []) {
    const organizationId = String(snapshot.organization_id ?? "");
    snapshotAccountingByOrganization.set(organizationId, snapshotAccountingEmails(snapshot));
    const authorization = snapshotRecipientsForDocument(snapshot, documentNumber, documentKind);
    if (!authorization.found) continue;
    documentFound = true;
    authorization.emails.forEach((email) => allowed.add(email));
  }

  const documentTable = documentKind === "quote" ? "quotes" : "invoices";
  const { data: documents, error: documentError } = await client
    .from(documentTable)
    .select("id, organization_id, customer_id, number, status, sent_at")
    .eq("number", documentNumber)
    .in("organization_id", organizationIds);
  if (documentError) throw new Error("Document inaccessible");

  if (documents?.length) {
    documentFound = true;
    const customerIds = [...new Set(documents.map((row) => String(row.customer_id)).filter(Boolean))];
    if (customerIds.length) {
      const { data: customers, error: customerError } = await client
        .from("customers")
        .select("id, emails")
        .in("id", customerIds);
      if (customerError) throw new Error("Client inaccessible");
      const document = documents.length === 1 ? documents[0] : null;
      const customer = document ? customers?.find(row => row.id === document.customer_id) : null;
      if (documentKind === "quote" && document?.id && ["draft", "sent"].includes(document.status)
        && toRecipients.some(email => uniqueValidEmails(customer?.emails ?? []).includes(email))) {
        sentQuote = { id: document.id, organization_id: document.organization_id, sent_at: document.sent_at };
      }
      uniqueValidEmails((customers ?? []).flatMap((row) => Array.isArray(row.emails) ? row.emails : []))
        .forEach((email) => allowed.add(email));
    }

    const matchingOrganizationIds = [...new Set(documents.map((row) => String(row.organization_id)).filter(Boolean))];
    matchingOrganizationIds.forEach((organizationId) => {
      snapshotAccountingByOrganization.get(organizationId)?.forEach((email) => allowed.add(email));
    });

    const { data: organizations, error: organizationError } = await client
      .from("organizations")
      .select("id, accountant_email")
      .in("id", matchingOrganizationIds);
    if (organizationError) throw new Error("Entreprise inaccessible");
    uniqueValidEmails((organizations ?? []).map((row) => row.accountant_email))
      .forEach((email) => allowed.add(email));
  }

  if (!documentFound) throw new ApiInputError("Document introuvable dans votre entreprise.", 404);
  if (!recipientsAreAuthorized(requestedRecipients, [...allowed], customRecipient)) {
    throw new ApiInputError("Ce destinataire n’est pas rattaché à ce document ou à votre comptabilité.", 403);
  }
  return { client, sentQuote, documentOrganizationId: documents?.length===1?String(documents[0].organization_id):null, senderEmail: userData.user.email };
}

export async function GET() {
  const from = resolveManufeoSender(process.env.RESEND_FROM_EMAIL);
  return NextResponse.json(
    { configured: Boolean(process.env.RESEND_API_KEY && from), smsConfigured: automaticSmsConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "email", 5);
  if (limited) return limited;

  try {
    const body = await readJsonBody<EmailBody>(request, 11_500_000);
    const documentNumber = requireString(body.documentNumber, "Numéro du document", 80);
    const documentKind = cleanDocumentKind(body.documentKind);
    let to: string[];
    try { to = documentEmailRecipients(body.to); }
    catch (error) { throw new ApiInputError(error instanceof Error ? error.message : 'Adresse du destinataire invalide.'); }
    const cc = cleanEmails(body.cc);
    let bcc = cleanEmails(body.bcc);

    const authorization = await authorizeRecipients(request, documentNumber, documentKind, [...to, ...cc, ...bcc], body.customRecipient === true, to);
    if (body.copyToSelf === true) {
      if (!authorization.senderEmail || !isEmail(authorization.senderEmail)) {
        throw new ApiInputError('L’adresse de votre compte est indisponible pour la copie cachée. Décochez cette option ou vérifiez votre compte.');
      }
      bcc = [...new Set([...bcc, authorization.senderEmail.toLowerCase()])];
    }
    bcc = bcc.filter(email => !to.includes(email) && !cc.includes(email));

    const subject = optionalString(body.subject, 998) || "Votre document";
    const incomingHtml = optionalString(body.html, 10_000_000) || "<p>Veuillez trouver votre document en pièce jointe.</p>";
    const attachments = cleanAttachments(body.attachments);

    const apiKey = process.env.RESEND_API_KEY;
    const from = resolveManufeoSender(process.env.RESEND_FROM_EMAIL);
    if (!apiKey) {
      return NextResponse.json(
        { configured: false, error: "Le service d’envoi n’est pas configuré." },
        { status: 503 },
      );
    }

    let composedHtml=incomingHtml;
    let signingUrl='';
    const withoutPrices=attachments.some(attachment=>/sans[-_ ]prix/iu.test(attachment.filename));
    if(body.requestSignature===true){
      if(documentKind!=='quote'||withoutPrices||to.length!==1||!authorization.documentOrganizationId)throw new ApiInputError('La signature nécessite un devis avec prix et un seul client destinataire.');
      const context=await authenticateRequest(request);
      requireOrganization(context,authorization.documentOrganizationId,['owner','admin','office','manager']);
      const signing=await createQuoteSignatureRequest(createServiceSupabase(),authorization.documentOrganizationId,documentNumber,to[0],publicSiteUrl(request));
      // The email and public signing page use the same immutable PDF.
      attachments[0]={filename:signing.pdf.filename,content:signing.pdf.content};
      composedHtml+=`<p>Pour lire le devis et donner votre bon pour accord, ouvrez ce lien personnel :<br>${signing.url}</p>`;
      signingUrl=signing.url;
    }
    const emailContent=buildClassicDocumentEmail(composedHtml);
    if(signingUrl)emailContent.html=emailContent.html.replace('</div></body>',`<p><a href="${signingUrl.replaceAll('&','&amp;').replaceAll('"','&quot;')}">Lire et signer le devis</a></p></div></body>`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from,
        to,
        cc,
        bcc,
        subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const safeProviderMessage = resendProviderErrorMessage(response.status, data);
      if (safeProviderMessage) throw new ApiInputError(safeProviderMessage, 503);
      throw new Error(`Resend API : ${response.status}`);
    }
    if (typeof data.id !== "string" || !data.id) throw new Error("Confirmation du fournisseur manquante.");
    let quoteSentRecorded = false;
    const quote = authorization.sentQuote;
    if (quote && !attachments.some(attachment => /sans[-_ ]prix/iu.test(attachment.filename))) {
      const result = await authorization.client.from("quotes")
        .update({ status: "sent", sent_at: quote.sent_at || new Date().toISOString() })
        .eq("id", quote.id).eq("organization_id", quote.organization_id).in("status", ["draft", "sent"])
        .select("id").maybeSingle();
      quoteSentRecorded = !result.error && Boolean(result.data);
      if (result.error) console.error("[MANUFEO] Date d’envoi du devis non enregistrée", result.error.code);
    }
    let sms:Awaited<ReturnType<typeof notifyQuoteEmailBySms>>|{status:'unavailable'}|undefined;
    if(body.notifyBySms===true&&documentKind==='quote'&&!withoutPrices&&authorization.documentOrganizationId){
      try{
        const context=await authenticateRequest(request);
        requireOrganization(context,authorization.documentOrganizationId,['owner','admin','office','manager']);
        const loaded=await context.client.from('quotes').select('customer:customers(emails,phones),organization:organizations(name)').eq('organization_id',authorization.documentOrganizationId).eq('number',documentNumber).single();
        if(loaded.error)throw loaded.error;
        const customer=Array.isArray(loaded.data.customer)?loaded.data.customer[0]:loaded.data.customer;
        const company=Array.isArray(loaded.data.organization)?loaded.data.organization[0]:loaded.data.organization;
        const phone=(customer?.phones||[]).map(smsMobileNumber).find(Boolean);
        const clientReceived=to.some(email=>uniqueValidEmails(customer?.emails).includes(email));
        sms=phone&&clientReceived?await notifyQuoteEmailBySms(phone,quoteEmailSmsMessage(documentNumber,company?.name||'')):{status:'unavailable'};
      }catch{sms={status:'unavailable'};}
    }
    return NextResponse.json({ configured: true, id: data.id, quoteSentRecorded, sms });
  } catch (error) {
    return errorResponse(error, "Envoi impossible.");
  }
}
