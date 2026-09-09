import { supabase } from "./supabase";
import type { EmailDocumentKind } from "./email-authorization";

export type AuthenticatedEmailPayload = {
  documentNumber: string;
  documentKind: EmailDocumentKind;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  attachments: Array<{ filename: string; content: string }>;
};

export async function sendAuthenticatedDocumentEmail(payload: AuthenticatedEmailPayload) {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous avant l’envoi.");

  return fetch("/api/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}
