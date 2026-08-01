"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isQuoteDetail(detail: HTMLElement) {
  return normalize(detail.querySelector("header small")?.textContent || "") === "devis";
}

export default function MobileLegacyQuoteDetailGuard() {
  useEffect(() => {
    const hideLegacyQuoteDetails = () => {
      document.querySelectorAll<HTMLElement>(".rm-detail-sheet").forEach((detail) => {
        if (!isQuoteDetail(detail)) return;

        detail.dataset.legacyQuoteDetail = "true";
        detail.setAttribute("aria-hidden", "true");

        const backdrop = detail.closest<HTMLElement>(".rm-modal-backdrop");
        if (!backdrop) return;

        backdrop.classList.add("rm-legacy-quote-detail-backdrop");
        backdrop.setAttribute("aria-hidden", "true");
      });
    };

    hideLegacyQuoteDetails();
    const observer = new MutationObserver(hideLegacyQuoteDetails);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLElement>(".rm-legacy-quote-detail-backdrop")
        .forEach((backdrop) => {
          backdrop.classList.remove("rm-legacy-quote-detail-backdrop");
          backdrop.removeAttribute("aria-hidden");
        });
      document
        .querySelectorAll<HTMLElement>("[data-legacy-quote-detail='true']")
        .forEach((detail) => {
          delete detail.dataset.legacyQuoteDetail;
          detail.removeAttribute("aria-hidden");
        });
    };
  }, []);

  return (
    <style>{`
      .rm-legacy-quote-detail-backdrop {
        display: none !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
