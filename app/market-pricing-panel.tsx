"use client";

import { BadgeEuro, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import {
  findMarketPriceReferences,
  formatFreshnessDate,
  formatMarketPrice,
  type MarketPriceLevel,
  type MarketPriceSelection,
} from "@/lib/forgeo-market-pricing";

type Props = {
  transcript: string;
  host: HTMLElement | null;
  selection: MarketPriceSelection | null;
  onSelect: (selection: MarketPriceSelection | null) => void;
};

function basisLabel(value: "HT" | "TTC" | "NON_PRECISE") {
  if (value === "NON_PRECISE") return "Base fiscale non précisée";
  return value;
}

const LEVELS: Array<{ key: MarketPriceLevel; label: string }> = [
  { key: "low", label: "Bas" },
  { key: "market", label: "Marché" },
  { key: "comfortable", label: "Confortable" },
];

export default function MarketPricingPanel({ transcript, host, selection, onSelect }: Props) {
  const references = findMarketPriceReferences(transcript);
  if (!host || references.length === 0) return null;

  return createPortal(
    <section className="forgeo-market-pricing" aria-label="Références de prix marché">
      <header>
        <BadgeEuro size={19} />
        <div>
          <strong>Références de prix BTP 2026</strong>
          <small>Repères sourcés · application uniquement sur action de l’artisan</small>
        </div>
      </header>

      <div className="forgeo-market-pricing-list">
        {references.map((reference) => (
          <article key={reference.id}>
            <div className="forgeo-market-pricing-topline">
              <div>
                <small>{reference.trade}</small>
                <strong>{reference.label}</strong>
              </div>
              <span title={reference.confidenceReason}>{reference.confidence === "high" ? "Confiance élevée" : "Confiance moyenne"}</span>
            </div>

            <div className="forgeo-market-pricing-levels">
              {LEVELS.map((level) => {
                const selected = selection?.referenceId === reference.id && selection.level === level.key;
                const actionable = Boolean(reference.quoteUnit);
                return (
                  <button
                    type="button"
                    key={level.key}
                    className={selected ? "selected" : ""}
                    disabled={!actionable}
                    aria-label={`${actionable ? "Utiliser" : "Référence informative"} le prix ${level.label} pour ${reference.label}`}
                    onClick={() => onSelect(selected ? null : { referenceId: reference.id, level: level.key })}
                  >
                    <small>{level.label}</small>
                    <b>{formatMarketPrice(reference[level.key])} {reference.unit}</b>
                    <em>{!actionable ? "Informatif" : selected ? "Sélectionné ✓" : "Utiliser ce prix"}</em>
                  </button>
                );
              })}
            </div>

            <p>{reference.methodology}</p>
            {reference.regionalNote && <p className="forgeo-market-pricing-region">{reference.regionalNote}</p>}
            <p className="forgeo-market-pricing-confidence">{reference.confidenceReason}</p>

            <footer>
              <span>{reference.year} · {basisLabel(reference.basis)} · maj. {formatFreshnessDate(reference.freshnessDate)}</span>
              <div>
                {reference.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.name} <ExternalLink size={12} /></a>
                ))}
              </div>
            </footer>
          </article>
        ))}
      </div>

      <p className="forgeo-market-pricing-warning">
        Un prix sélectionné n’est injecté qu’à l’ouverture du formulaire, sur un seul poste compatible dont le prix est encore vide et dont l’unité correspond. Un prix dicté ou déjà renseigné n’est jamais écrasé ; quantité, unité et TVA ne sont jamais modifiées.
      </p>

      <style>{`
        .forgeo-market-pricing{position:relative;z-index:6000;isolation:isolate;pointer-events:auto;margin:12px 0;padding:13px;border:1px solid #cfe0eb;border-radius:16px;background:#f8fbfd;display:grid;gap:10px}.forgeo-market-pricing *{pointer-events:auto}.forgeo-market-pricing>header{display:flex;gap:9px;align-items:center;color:#184f73}.forgeo-market-pricing>header div{display:grid;gap:2px}.forgeo-market-pricing>header strong{font-size:13px}.forgeo-market-pricing>header small{font-size:10px;color:#687c8d}.forgeo-market-pricing-list{display:grid;gap:8px}.forgeo-market-pricing article{background:#fff;border:1px solid #dbe6ed;border-radius:13px;padding:11px;display:grid;gap:8px}.forgeo-market-pricing-topline{display:flex;justify-content:space-between;gap:8px;align-items:start}.forgeo-market-pricing-topline>div{display:grid;gap:2px}.forgeo-market-pricing-topline>div>small{font-size:8.5px;font-weight:900;color:#6b7f8f;text-transform:uppercase;letter-spacing:.04em}.forgeo-market-pricing-topline strong{font-size:12px;color:#213f55}.forgeo-market-pricing-topline>span{font-size:9px;font-weight:800;color:#2a6c98;background:#edf6fb;border-radius:999px;padding:4px 7px;white-space:nowrap}.forgeo-market-pricing-levels{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.forgeo-market-pricing-levels>button{position:relative;z-index:1;border:1px solid #e2eaf0;border-radius:10px;padding:8px;background:#fff;display:grid;gap:2px;text-align:left;color:inherit;touch-action:manipulation}.forgeo-market-pricing-levels>button:not(:disabled){cursor:pointer}.forgeo-market-pricing-levels>button.selected{border-color:#2a6c98;background:#edf6fb;box-shadow:0 0 0 1px #2a6c98 inset}.forgeo-market-pricing-levels>button:disabled{opacity:.62}.forgeo-market-pricing-levels small{font-size:9px;color:#718292}.forgeo-market-pricing-levels b{font-size:11px;color:#193d56}.forgeo-market-pricing-levels em{font-size:8px;font-style:normal;font-weight:800;color:#2a6c98}.forgeo-market-pricing article p{margin:0;font-size:9.5px;line-height:1.35;color:#617686}.forgeo-market-pricing-region{background:#fff8e9;border-radius:8px;padding:7px!important;color:#75591c!important}.forgeo-market-pricing-confidence{color:#315d78!important;font-weight:700}.forgeo-market-pricing article footer{display:grid;gap:5px;font-size:9px;color:#708292}.forgeo-market-pricing article footer>div{display:flex;flex-wrap:wrap;gap:5px 10px}.forgeo-market-pricing article footer a{display:inline-flex;align-items:center;gap:3px;color:#245f87;font-weight:800;text-decoration:none}.forgeo-market-pricing-warning{margin:0!important;font-size:9.5px!important;line-height:1.4!important;color:#526b7c!important;background:#edf4f8;border-radius:10px;padding:8px!important}@media(max-width:390px){.forgeo-market-pricing-levels{grid-template-columns:1fr}.forgeo-market-pricing-levels>button{grid-template-columns:auto 1fr auto;align-items:center;gap:8px}}
      `}</style>
    </section>,
    host,
  );
}
