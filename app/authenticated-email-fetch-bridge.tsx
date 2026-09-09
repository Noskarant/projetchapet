"use client";

import { useEffect } from "react";
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

      if (typeof init?.body !== "string") return originalFetch(input, init);

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return originalFetch(input, init);
      }

      const documentNumber = documentNumberFromPayload(payload);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return originalFetch(input, init);

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Content-Type", "application/json");

      return originalFetch(input, {
        ...init,
        headers,
        body: JSON.stringify({
          ...payload,
          documentNumber: payload.documentNumber || documentNumber,
          documentKind: payload.documentKind || documentKindFromNumber(documentNumber),
        }),
      });
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
