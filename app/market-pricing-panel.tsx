"use client";

import { BadgeEuro, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import { findMarketPriceReferences, formatMarketPrice } from "@/lib/forgeo-market-pricing";

type Props = {
  transcript: string;
  host: HTMLElement | null;
};

function basisLabel(value: "HT" | "TTC" | "NON_PRECISE") {
  if (value === "NON_PRECISE") return "Base fiscale non précisée par la source";
  return value;
}

export default function MarketPricingPanel({ transcript, host }: Props) {
  const references = findMarketPriceReferences(transcript);
  if (!host || references.length === 0) return null;

  return createPortal(
    <section className="forgeo-market-pricing" aria-label="Références de prix marché">
      <header>
        <BadgeEuro size={19} />
        <div>
          <strong>Références de prix 2026</strong>
          <small>Indications sourcées · jamais appliquées automatiquement au devis</small>
        </div>
      </header>

      <div className="forgeo-market-pricing-list">
        {references.map((reference) => (
          <article key={reference.id}>
            <div className="forgeo-market-pricing-topline">
              <strong>{reference.label}</strong>
              <span>{reference.confidence === "high" ? "Confiance élevée" : "Confiance moyenne"}</span>
            </div>
            <div className="forgeo-market-pricing-levels">
              <div><small>Bas</small><b>{formatMarketPrice(reference.low)} {reference.unit}</b></div>
              <div><small>Marché</small><b>{formatMarketPrice(reference.market)} {reference.unit}</b></div>
              <div><small>Confortable</small><b>{formatMarketPrice(reference.comfortable)} {reference.unit}</b></div>
            </div>
            <p>{reference.methodology}</p>
            {reference.regionalNote && <p className="forgeo-market-pricing-region">{reference.regionalNote}</p>}
            <footer>
              <span>{reference.year} · {basisLabel(reference.basis)}</span>
              <a href={reference.sourceUrl} target="_blank" rel="noreferrer">{reference.sourceName} <ExternalLink size={12} /></a>
            </footer>
          </article>
        ))}
      </div>

      <p className="forgeo-market-pricing-warning">Ces montants servent de repères commerciaux. FORGEO ne remplit ni quantité, ni prix, ni TVA à partir de ces références sans action explicite de l’artisan.</p>

      <style>{`
        .forgeo-market-pricing{margin:12px 0;padding:13px;border:1px solid #cfe0eb;border-radius:16px;background:#f8fbfd;display:grid;gap:10px}.forgeo-market-pricing>header{display:flex;gap:9px;align-items:center;color:#184f73}.forgeo-market-pricing>header div{display:grid;gap:2px}.forgeo-market-pricing>header strong{font-size:13px}.forgeo-market-pricing>header small{font-size:10px;color:#687c8d}.forgeo-market-pricing-list{display:grid;gap:8px}.forgeo-market-pricing article{background:#fff;border:1px solid #dbe6ed;border-radius:13px;padding:11px;display:grid;gap:8px}.forgeo-market-pricing-topline{display:flex;justify-content:space-between;gap:8px;align-items:start}.forgeo-market-pricing-topline strong{font-size:12px;color:#213f55}.forgeo-market-pricing-topline span{font-size:9px;font-weight:800;color:#2a6c98;background:#edf6fb;border-radius:999px;padding:4px 7px;white-space:nowrap}.forgeo-market-pricing-levels{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.forgeo-market-pricing-levels>div{border:1px solid #e2eaf0;border-radius:10px;padding:8px;display:grid;gap:2px}.forgeo-market-pricing-levels small{font-size:9px;color:#718292}.forgeo-market-pricing-levels b{font-size:11px;color:#193d56}.forgeo-market-pricing article p{margin:0;font-size:9.5px;line-height:1.35;color:#617686}.forgeo-market-pricing-region{background:#fff8e9;border-radius:8px;padding:7px!important;color:#75591c!important}.forgeo-market-pricing article footer{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:9px;color:#708292}.forgeo-market-pricing article footer a{display:inline-flex;align-items:center;gap:3px;color:#245f87;font-weight:800;text-decoration:none;text-align:right}.forgeo-market-pricing-warning{margin:0!important;font-size:9.5px!important;color:#667b8b!important}
      `}</style>
    </section>,
    host,
  );
}
