import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { resendProviderErrorMessage, resolveManufeoSender } from "@/lib/resend-email";
import { authenticateRequest, requireOrganization, type AuthenticatedRequestContext } from "@/lib/server-auth";
import { assertVoiceEmailRetry, reviewVoiceEmail, voiceEmailHtml, type VoiceEmailDelivery } from "@/lib/voice-email-delivery";
import { buildVoiceEmailQuoteAttachment } from "@/lib/voice-email-quote-pdf";

export const runtime = "nodejs";

function optionalQuoteId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value.trim())) {
    throw new ApiInputError("Devis sélectionné invalide.");
  }
  return value.trim();
}

async function quoteAttachment(
  context: AuthenticatedRequestContext,
  organizationId: string,
  quoteId: string,
  recipient: string,
) {
  const { data: quote, error: quoteError } = await context.client
    .from("quotes")
    .select("id,number,title,status,issue_date,expiry_date,subtotal,tax_total,total,notes,customer_id,customer:customers(id,kind,company_name,civility,last_name,first_name,emails,phones,addresses,siret,vat_number,notes),items:quote_items(id,position,label,description,quantity,unit,unit_price,tax_rate,total)")
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError) throw new Error("Recherche du devis impossible.");
  if (!quote) throw new ApiInputError("Le devis sélectionné est introuvable.", 404);

  const { data: organization, error: organizationError } = await context.client
    .from("organizations")
    .select("id,name,siret,vat_number,phone,email,address")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) throw new Error("Entreprise indisponible.");

  const { data: snapshot } = await context.client
    .from("pilot_workspace_snapshots")
    .select("company_profile")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return buildVoiceEmailQuoteAttachment({
    quote: quote as unknown as Parameters<typeof buildVoiceEmailQuoteAttachment>[0]["quote"],
    customer: (quote as unknown as { customer: Parameters<typeof buildVoiceEmailQuoteAttachment>[0]["customer"] }).customer,
    organization: organization as Parameters<typeof buildVoiceEmailQuoteAttachment>[0]["organization"],
    companyProfile: snapshot?.company_profile,
    recipient,
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "voice-email-send", 5);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{ organizationId?: unknown; proposalId?: unknown; subject?: unknown; message?: unknown; quoteId?: unknown }>(request, 10_000);
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
    const requestedQuoteId = optionalQuoteId(body.quoteId);
    if (!organizationId || !/^[0-9a-f-]{36}$/i.test(proposalId)) throw new ApiInputError("Brouillon ou entreprise manquants.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId);
    const { data: proposal, error: proposalError } = await context.client.from("action_proposals")
      .select("id,payload").eq("id", proposalId).eq("organization_id", organizationId)
      .eq("intent_type", "prepare_email").eq("status", "executed").maybeSingle();
    if (proposalError) throw new Error("Brouillon indisponible.");
    if (!proposal) throw new ApiInputError("Brouillon introuvable ou non validé.", 404);

    const payload = proposal.payload as Record<string, unknown>;
    const content = reviewVoiceEmail(payload.to, body.subject, body.message);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new ApiInputError("Le service d’envoi n’est pas configuré.", 503);
    const from = resolveManufeoSender(process.env.RESEND_FROM_EMAIL);

    const { data: previous, error: readError } = await context.client.from("voice_email_deliveries")
      .select("proposal_id,recipient,subject,body,status,provider_id,sent_at,attachment_quote_id,attachment_filename,attachment_base64,created_at,updated_at")
      .eq("proposal_id", proposalId).eq("organization_id", organizationId).maybeSingle();
    if (readError) throw new Error("État de l’envoi indisponible.");

    let attachment: { quoteId: string | null; filename: string; content: string } | null = null;

    if (previous) {
      const saved = previous as VoiceEmailDelivery;
      assertVoiceEmailRetry(saved, content, requestedQuoteId);
      if (saved.attachment_filename && saved.attachment_base64) {
        attachment = {
          quoteId: saved.attachment_quote_id,
          filename: saved.attachment_filename,
          content: saved.attachment_base64,
        };
      }
      const { data: claimed, error: claimError } = await context.client.from("voice_email_deliveries")
        .update({ status: "sending", updated_at: new Date().toISOString() })
        .eq("proposal_id", proposalId).eq("organization_id", organizationId)
        .eq("status", previous.status).eq("updated_at", previous.updated_at)
        .select("proposal_id").maybeSingle();
      if (claimError) throw new Error("Reprise de l’envoi impossible.");
      if (!claimed) throw new ApiInputError("Cet envoi est déjà en cours.", 409);
    } else {
      attachment = requestedQuoteId
        ? await quoteAttachment(context, organizationId, requestedQuoteId, content.recipient)
        : null;
      const { error: insertError } = await context.client.from("voice_email_deliveries").insert({
        proposal_id: proposalId,
        organization_id: organizationId,
        sent_by: context.user.id,
        ...content,
        status: "sending",
        attachment_quote_id: attachment?.quoteId ?? null,
        attachment_filename: attachment?.filename ?? null,
        attachment_base64: attachment?.content ?? null,
      });
      if (insertError?.code === "23505") throw new ApiInputError("Cet envoi est déjà en cours.", 409);
      if (insertError) throw new Error("Préparation de l’envoi impossible.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `voice-email/${proposalId}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from,
        to: [content.recipient],
        subject: content.subject,
        html: voiceEmailHtml(content.body),
        text: content.body,
        ...(attachment ? { attachments: [{ filename: attachment.filename, content: attachment.content }] } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const safeMessage = resendProviderErrorMessage(response.status, result);
      if (safeMessage) throw new ApiInputError(safeMessage, 503);
      throw new Error(`Envoi fournisseur refusé (${response.status}).`);
    }
    if (typeof result.id !== "string" || !result.id.trim()) throw new Error("Confirmation du fournisseur manquante.");

    const sentAt = new Date().toISOString();
    const { data: saved, error: saveError } = await context.client.from("voice_email_deliveries")
      .update({ status: "sent", provider_id: result.id, sent_at: sentAt, updated_at: sentAt })
      .eq("proposal_id", proposalId).eq("organization_id", organizationId).eq("status", "sending")
      .select("proposal_id").maybeSingle();
    if (saveError || !saved) throw new Error("Confirmation de l’envoi impossible.");
    if (attachment?.quoteId) {
      // This attachment was checked against the recipient before sending.
      const { data: quote } = await context.client.from("quotes").select("sent_at").eq("id", attachment.quoteId).eq("organization_id", organizationId).maybeSingle();
      const { error: quoteError } = await context.client.from("quotes")
        .update({ status: "sent", sent_at: quote?.sent_at || sentAt }).eq("id", attachment.quoteId)
        .eq("organization_id", organizationId).in("status", ["draft", "sent"]);
      if (quoteError) console.error("[MANUFEO] Date d’envoi du devis non enregistrée", quoteError.code);
    }
    return NextResponse.json({
      sent: true,
      sentAt,
      providerId: result.id,
      attachmentQuoteId: attachment?.quoteId ?? null,
      attachmentFilename: attachment?.filename ?? null,
    });
  } catch (error) {
    return errorResponse(error, "L’envoi n’a pas pu être confirmé. Vérifiez son état avant de réessayer.");
  }
}
