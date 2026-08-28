"use client";

import { BriefcaseBusiness, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { getTradeProfile, readForgeoBusinessProfile } from "@/lib/copilot/business-profile";
import { getCopilotTradePack } from "@/lib/copilot/trade-packs";
import type { CopilotTrade } from "@/lib/copilot/types";

const TRADE_EXAMPLES: Record<CopilotTrade, string> = {
  interior_painting: "Ex. Chez SCI Bellevue, je dois repeindre un appartement de 65 m² avec les plafonds, quelques fissures et quatre portes.",
  upholstery_decorator: "Ex. Deux fauteuils Voltaire à refaire en traditionnel, dégarnissage complet, tissu fourni par le client, avec galon et livraison.",
  plumbing_heating: "Ex. Chez Mme Arnaud, je remplace 2 WC, je pose 3 radiateurs et je tire 18 m de multicouche.",
  electrician: "Ex. Huit prises 2P+T, quatre DCL, deux circuits dédiés et 45 m de gaine ICTA avec reprise du tableau.",
  carpentry_joinery: "Ex. Trois fenêtres à remplacer, un dressing sur mesure, 4,2 m de plan de travail et 17 m de plinthes.",
  tiling_flooring: "Ex. 42 m² de carrelage au sol, 18 m² de faïence, ragréage, SPEC et 31 m de plinthes.",
  roofing: "Ex. Réfection de 120 m² de tuiles, 14 m de faîtage, 26 m de gouttière zinc, deux Velux et échafaudage.",
  masonry: "Ex. 35 m² de mur en parpaing, dalle béton de 28 m², deux ouvertures et 12 m de semelle filante.",
  landscaping: "Ex. 150 m² de gazon, 25 m de haie, 12 arbustes, 30 m² de terrasse pavée et 40 m de clôture.",
  locksmith_metalwork: "Ex. Deux cylindres à remplacer, ouverture d’une porte claquée, 8 m de garde-corps et un portail acier.",
};

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

function applyTradeExperience() {
  const profile = readForgeoBusinessProfile(window.localStorage);
  const pack = getCopilotTradePack(profile.primaryTrade);
  const textarea = document.querySelector<HTMLTextAreaElement>("#mcp-description");
  const eyebrow = document.querySelector<HTMLElement>(".mcp-header small");
  const intro = document.querySelector<HTMLElement>(".mcp-intro small");
  const placeholder = TRADE_EXAMPLES[profile.primaryTrade];
  const eyebrowText = `COPILOTE · ${pack.shortLabel.toUpperCase()}`;

  if (textarea && textarea.placeholder !== placeholder) textarea.placeholder = placeholder;
  if (eyebrow && eyebrow.textContent !== eyebrowText) eyebrow.textContent = eyebrowText;
  if (intro && intro.textContent !== pack.description) intro.textContent = pack.description;
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

    const observer = new MutationObserver(() => applyTradeExperience());
    observer.observe(document.body, { childList: true, subtree: true });
    const onProfileUpdate = () => applyTradeExperience();
    window.addEventListener("forgeo:business-profile-updated", onProfileUpdate);
    applyTradeExperience();

    window.fetch = bridgedFetch;
    return () => {
      observer.disconnect();
      window.removeEventListener("forgeo:business-profile-updated", onProfileUpdate);
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
