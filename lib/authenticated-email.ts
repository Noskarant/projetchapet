import { supabase } from "./supabase";
import type { EmailDocumentKind } from "./email-authorization";
import { documentEmailRecipients } from './document-email-recipients';

export type AuthenticatedEmailPayload = {
  documentNumber: string;
  documentKind: EmailDocumentKind;
  to: string | string[];
  customRecipient?: boolean;
  copyToSelf?: boolean;
  requestSignature?: boolean;
  notifyBySms?: boolean;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  attachments: Array<{ filename: string; content: string }>;
};

export function isClientEmailAddress(value: string) {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function documentEmailErrorMessage(response: Response) {
  const result = await response.clone().json().catch(() => ({})) as { error?: unknown };
  if (typeof result.error === "string" && result.error.trim()) return result.error.trim();
  if (response.status === 401) return "Votre session a expiré. Reconnectez-vous avant l’envoi.";
  if (response.status === 403) return "Ce destinataire n’est pas autorisé pour ce document.";
  if (response.status === 404) return "Le document n’a pas encore été synchronisé. Réessayez dans quelques secondes.";
  if (response.status === 413) return "Le PDF est trop volumineux pour être envoyé.";
  return "L’e-mail n’a pas pu être envoyé depuis MANUFEO. Réessayez dans quelques instants.";
}

export async function sendAuthenticatedDocumentEmail(payload: AuthenticatedEmailPayload) {
  const recipients = documentEmailRecipients(payload.to);

  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous avant l’envoi.");

  const response = await fetch("/api/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...payload, to: recipients.length === 1 ? recipients[0] : recipients }),
  });

  if (!response.ok) throw new Error(await documentEmailErrorMessage(response));
  if (payload.notifyBySms && typeof window !== 'undefined') {
    const result = await response.clone().json().catch(() => ({}));
    const sms = result.sms;
    if ((sms?.status === 'manual' || sms?.status === 'failed') && sms.phone && sms.message) {
      window.dispatchEvent(new CustomEvent('manufeo:email-sms-ready', { detail: { phone: sms.phone, message: sms.message } }));
    }
  }
  return response;
}
