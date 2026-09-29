import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { resendProviderErrorMessage, resolveManufeoSender } from "@/lib/resend-email";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";
import { assertVoiceEmailRetry, reviewVoiceEmail, voiceEmailHtml, type VoiceEmailDelivery } from "@/lib/voice-email-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, "voice-email-send", 5);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{ organizationId?: unknown; proposalId?: unknown; subject?: unknown; message?: unknown }>(request, 10_000);
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
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
      .select("proposal_id,recipient,subject,body,status,provider_id,sent_at,created_at,updated_at")
      .eq("proposal_id", proposalId).eq("organization_id", organizationId).maybeSingle();
    if (readError) throw new Error("État de l’envoi indisponible.");

    if (previous) {
      assertVoiceEmailRetry(previous as VoiceEmailDelivery, content);
      const { data: claimed, error: claimError } = await context.client.from("voice_email_deliveries")
        .update({ status: "sending", updated_at: new Date().toISOString() })
        .eq("proposal_id", proposalId).eq("organization_id", organizationId)
        .eq("status", previous.status).eq("updated_at", previous.updated_at)
        .select("proposal_id").maybeSingle();
      if (claimError) throw new Error("Reprise de l’envoi impossible.");
      if (!claimed) throw new ApiInputError("Cet envoi est déjà en cours.", 409);
    } else {
      const { error: insertError } = await context.client.from("voice_email_deliveries").insert({
        proposal_id: proposalId, organization_id: organizationId, sent_by: context.user.id,
        ...content, status: "sending",
      });
      if (insertError?.code === "23505") throw new ApiInputError("Cet envoi est déjà en cours.", 409);
      if (insertError) throw new Error("Préparation de l’envoi impossible.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `voice-email/${proposalId}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ from, to: [content.recipient], subject: content.subject, html: voiceEmailHtml(content.body), text: content.body }),
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
    return NextResponse.json({ sent: true, sentAt, providerId: result.id });
  } catch (error) {
    return errorResponse(error, "L’envoi n’a pas pu être confirmé. Vérifiez son état avant de réessayer.");
  }
}
