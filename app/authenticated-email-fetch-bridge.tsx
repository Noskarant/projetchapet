"use client";

import { useEffect } from "react";
import {
  documentEmailErrorMessage,
  isClientEmailAddress,
} from "@/lib/authenticated-email";
import { supabase } from "@/lib/supabase";

function documentNumberFromPayload(payload: Record<string, unknown>) {
  if (typeof payload.documentNumber === "string" && payload.documentNumber.trim()) {
    return payload.documentNumber.trim();
  }
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const first = attachments[0];
  if (!first || typeof first !== "object") return "";
  const filename = String((first as Record<string, unknown>).filename ?? "").trim();
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/-(sans-prix|chantier)$/i, "")
    .trim();
}

function documentKindFromNumber(number: string) {
  return /^(D-|DEV-)/i.test(number) ? "quote" : "invoice";
}

export default function AuthenticatedEmailFetchBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const target = new URL(url, window.location.origin);
      if (target.origin !== window.location.origin || target.pathname !== "/api/email" || method !== "POST") {
        return originalFetch(input, init);
      }

      if (typeof init?.body !== "string") {
        throw new Error("La demande d’envoi MANUFEO est invalide. Rechargez l’application puis réessayez.");
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        throw new Error("La demande d’envoi MANUFEO est invalide. Rechargez l’application puis réessayez.");
      }

      const recipient = typeof payload.to === "string" ? payload.to.trim() : "";
      if (!isClientEmailAddress(recipient)) {
        throw new Error("L’adresse e-mail du destinataire est invalide. Corrigez-la dans la fiche client avant l’envoi.");
      }

      const documentNumber = documentNumberFromPayload(payload);
      if (!documentNumber) {
        throw new Error("Le document à envoyer n’a pas pu être identifié. Fermez cette fenêtre puis réessayez.");
      }

      const { data, error } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (error || !token) {
        throw new Error("Votre session a expiré. Reconnectez-vous avant l’envoi.");
      }

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Content-Type", "application/json");

      const response = await originalFetch(input, {
        ...init,
        headers,
        body: JSON.stringify({
          ...payload,
          to: recipient,
          documentNumber: payload.documentNumber || documentNumber,
          documentKind: payload.documentKind || documentKindFromNumber(documentNumber),
        }),
      });

      if (!response.ok) {
        throw new Error(await documentEmailErrorMessage(response));
      }

      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
