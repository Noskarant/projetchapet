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

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function absoluteFetchInput(input: RequestInfo | URL): RequestInfo | URL {
  if (isRequest(input)) return input;
  return new URL(String(input), window.location.href).href;
}

function requestPath(input: RequestInfo | URL) {
  const value = isRequest(input) ? input.url : String(input);
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value;
  }
}

function isSafariPatternError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const value = `${error.name} ${error.message}`.toLocaleLowerCase("en-US");
  return value.includes("expected pattern") || value.includes("did not match the expected pattern");
}

export default function MobileAiContextBridge() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    const safeNativeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await nativeFetch(absoluteFetchInput(input), init);
      } catch (error) {
        if (isSafariPatternError(error)) {
          throw new Error("Safari n’a pas pu démarrer le service vocal. Réessayez une fois ; si nécessaire, rechargez la page.");
        }
        throw error;
      }
    };

    const strictFetch: typeof window.fetch = async (input, init) => {
      if (requestPath(input) !== "/api/ai/parse" || typeof init?.body !== "string") {
        return safeNativeFetch(input, init);
      }

      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (body.kind !== "document") return safeNativeFetch(input, init);

        return safeNativeFetch("/api/ai/parse-strict", {
          ...init,
          body: JSON.stringify({
            ...body,
            context_clients: readContextClients(),
          }),
        });
      } catch (error) {
        if (isSafariPatternError(error)) {
          throw new Error("Safari n’a pas pu lancer l’analyse vocale. Réessayez une fois ; si nécessaire, rechargez la page.");
        }
        return safeNativeFetch(input, init);
      }
    };

    window.fetch = strictFetch;
    return () => {
      if (window.fetch === strictFetch) window.fetch = nativeFetch;
    };
  }, []);

  return null;
}
