"use client";

import { useEffect, useState } from "react";
import MarketPricingPanel from "./market-pricing-panel";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export default function MarketPricingExperience() {
  const [transcript, setTranscript] = useState("");
  const [reviewHost, setReviewHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.includes("/api/ai/parse") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as { transcript?: string };
          if (body.transcript) setTranscript(body.transcript);
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
    const locateReview = () => {
      const next = document.querySelector<HTMLElement>(".mai-review");
      setReviewHost((current) => current === next ? current : next);
    };
    const observer = new MutationObserver(locateReview);
    observer.observe(document.body, { subtree: true, childList: true });
    locateReview();
    return () => observer.disconnect();
  }, []);

  return <MarketPricingPanel transcript={transcript} host={reviewHost} />;
}
