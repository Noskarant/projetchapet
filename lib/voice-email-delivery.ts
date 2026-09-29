import { ApiInputError, isEmail } from "./api-guard";

export type VoiceEmailDelivery = {
  proposal_id: string;
  recipient: string;
  subject: string;
  body: string;
  status: "sending" | "failed" | "sent";
  provider_id: string | null;
  sent_at: string | null;
  attachment_quote_id: string | null;
  attachment_filename: string | null;
  attachment_base64?: string | null;
  created_at: string;
  updated_at: string;
};

export function reviewVoiceEmail(recipient: unknown, subject: unknown, body: unknown) {
  if (typeof recipient !== "string" || !isEmail(recipient.trim())) throw new ApiInputError("Adresse du destinataire invalide.");
  if (typeof subject !== "string" || !subject.trim() || subject.trim().length > 998) throw new ApiInputError("Objet d’e-mail manquant ou trop long.");
  if (typeof body !== "string" || !body.trim() || body.trim().length > 6000) throw new ApiInputError("Message manquant ou trop long.");
  return { recipient: recipient.trim().toLowerCase(), subject: subject.trim(), body: body.trim() };
}

export function assertVoiceEmailRetry(
  delivery: VoiceEmailDelivery,
  content: ReturnType<typeof reviewVoiceEmail>,
  requestedQuoteId: string | null = null,
  now = Date.now(),
) {
  if (delivery.status === "sent") throw new ApiInputError("Cet e-mail a déjà été envoyé.", 409);
  if (delivery.recipient !== content.recipient || delivery.subject !== content.subject || delivery.body !== content.body) {
    throw new ApiInputError("Une tentative d’envoi existe déjà. Reprenez-la avec le même message pour éviter un doublon.", 409);
  }
  const hasSnapshot = Boolean(delivery.attachment_filename && delivery.attachment_base64);
  const attachmentChanged = delivery.attachment_quote_id
    ? requestedQuoteId !== delivery.attachment_quote_id
    : hasSnapshot
      ? Boolean(requestedQuoteId)
      : Boolean(requestedQuoteId);
  if (attachmentChanged) {
    throw new ApiInputError("Une tentative d’envoi existe déjà avec une autre pièce jointe. Reprenez-la à l’identique pour éviter un doublon.", 409);
  }
  if (!Number.isFinite(Date.parse(delivery.created_at)) || now - Date.parse(delivery.created_at) > 23 * 60 * 60 * 1000) {
    throw new ApiInputError("L’état de cet envoi doit être vérifié avant toute nouvelle tentative. Contactez le support.", 409);
  }
  if (delivery.status === "sending" && now - Date.parse(delivery.updated_at) < 40_000) {
    throw new ApiInputError("L’envoi est déjà en cours. Réessayez dans quelques instants si aucun résultat ne s’affiche.", 409);
  }
}

export function voiceEmailHtml(body: string) {
  const escaped = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escaped}</div>`;
}
