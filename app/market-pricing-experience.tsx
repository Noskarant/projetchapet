"use client";

import { useEffect, useState } from "react";
import { applyMarketPriceToQuoteItems, type MarketPriceSelection } from "@/lib/forgeo-market-pricing";
import MarketPricingPanel from "./market-pricing-panel";

type QuoteItem = {
  label?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  tax_rate?: number | null;
};

type ApplyDetail = {
  target?: string;
  data?: { items?: QuoteItem[] };
};

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export default function MarketPricingExperience() {
  const [transcript, setTranscript] = useState("");
  const [reviewHost, setReviewHost] = useState<HTMLElement | null>(null);
  const [selection, setSelection] = useState<MarketPriceSelection | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.includes("/api/ai/parse") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as { transcript?: string };
          if (body.transcript) {
            setTranscript(body.transcript);
            setSelection(null);
          }
        } catch {}
      }
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const apply = (event: Event) => {
      if (!selection) return;
      const detail = (event as CustomEvent<ApplyDetail>).detail;
      if (detail?.target !== "quote" || !detail.data) return;
      const result = applyMarketPriceToQuoteItems(detail.data.items, selection, transcript);
      if (!result.applied) return;
      detail.data.items = result.items;
      setSelection(null);
    };
    window.addEventListener("projetchapet:ai-apply", apply, { capture: true });
    return () => window.removeEventListener("projetchapet:ai-apply", apply, { capture: true });
  }, [selection, transcript]);

  useEffect(() => {
    const locateReview = () => {
      const next = document.querySelector<HTMLElement>(".mai-review");
      setReviewHost((current) => current === next ? current : next);
    };
    const observer = new MutationObserver(locateReview);
    observer.observe(document.body, { subtree: true, childList: true });
    locateReview();
    return () => observer.disconnect();
  }, []);

  return <MarketPricingPanel transcript={transcript} host={reviewHost} selection={selection} onSelect={setSelection} />;
}
