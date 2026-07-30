"use client";

import { useEffect } from "react";
import { customerDisplayName } from "@/lib/mobile-prototype";
import { parseMobileWorkspace } from "@/lib/mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";

function readContextClients() {
  try {
    const workspace = parseMobileWorkspace(window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY));
    if (!workspace) return [];
    return [...new Set(workspace.customers.map(customerDisplayName).map((name) => name.trim()).filter(Boolean))].slice(0, 300);
  } catch {
    return [];
  }
}

function requestPath(input: RequestInfo | URL) {
  const value = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

export default function MobileAiContextBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const strictFetch: typeof window.fetch = async (input, init) => {
      if (requestPath(input) !== "/api/ai/parse" || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }

      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (body.kind !== "document") return originalFetch(input, init);

        return originalFetch("/api/ai/parse-strict", {
          ...init,
          body: JSON.stringify({
            ...body,
            context_clients: readContextClients(),
          }),
        });
      } catch {
        return originalFetch(input, init);
      }
    };

    window.fetch = strictFetch;
    return () => {
      if (window.fetch === strictFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
