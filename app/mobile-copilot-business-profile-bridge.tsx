"use client";

import { BriefcaseBusiness, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { getTradeProfile, readForgeoBusinessProfile } from "@/lib/copilot/business-profile";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

export default function MobileCopilotBusinessProfileBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const bridgedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      const isCopilotProposal = method === "POST"
        && (url === "/api/copilot/proposal" || url.endsWith("/api/copilot/proposal"));

      if (!isCopilotProposal || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }

      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        const profile = readForgeoBusinessProfile(window.localStorage);
        const tradeProfile = getTradeProfile(profile, profile.primaryTrade);
        return originalFetch(input, {
          ...init,
          body: JSON.stringify({
            ...body,
            trade: profile.primaryTrade,
            catalog: tradeProfile.catalog,
            settings: tradeProfile.settings,
          }),
        });
      } catch {
        return originalFetch(input, init);
      }
    };

    window.fetch = bridgedFetch;
    return () => {
      if (window.fetch === bridgedFetch) window.fetch = originalFetch;
    };
  }, []);

  return (
    <>
      <div className="fbs-launchers">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("forgeo:open-business-settings"))}
          aria-label="Configurer le métier et les tarifs FORGEO"
        >
          <BriefcaseBusiness size={17} />
          <span>Métier & tarifs</span>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("forgeo:open-project-profitability"))}
          aria-label="Ouvrir la rentabilité réelle FORGEO"
        >
          <TrendingUp size={17} />
          <span>Rentabilité</span>
        </button>
      </div>
      <style>{`
        .fbs-launchers{position:fixed;z-index:4190;left:14px;bottom:calc(84px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:flex-start;gap:7px}.fbs-launchers button{min-height:40px;display:inline-flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #c9d6e2;border-radius:999px;background:rgba(255,255,255,.96);color:#214d73;box-shadow:0 8px 22px rgba(15,47,82,.15);font:800 12px/1 Arial,sans-serif;backdrop-filter:blur(8px)}
        @media(min-width:821px){.fbs-launchers{display:none}}
      `}</style>
    </>
  );
}
