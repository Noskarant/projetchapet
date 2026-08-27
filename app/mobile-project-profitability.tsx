"use client";

import { Check, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MobileWorkspace } from "@/lib/mobile-prototype";
import { calculateProjectProfitability, profitabilitySignal, type ProjectCostEntry } from "@/lib/copilot/project-profitability";
import { readForgeoBusinessProfile, getTradeProfile } from "@/lib/copilot/business-profile";

const WORKSPACE_KEY = "projetchapet-mobile-workspace-v3";
const ACTUALS_KEY = "forgeo:project-actuals:v1";

type ActualForm = {
  labourCost: number;
  labourHours: number;
  materialCost: number;
  travelCost: number;
  subcontractCost: number;
  otherCost: number;
};

type StoredActuals = Record<string, ActualForm>;

const EMPTY: ActualForm = { labourCost: 0, labourHours: 0, materialCost: 0, travelCost: 0, subcontractCost: 0, otherCost: 0 };

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value || 0);
}

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readWorkspace(): MobileWorkspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    return raw ? JSON.parse(raw) as MobileWorkspace : null;
  } catch {
    return null;
  }
}

function readActuals(): StoredActuals {
  try {
    const raw = localStorage.getItem(ACTUALS_KEY);
    return raw ? JSON.parse(raw) as StoredActuals : {};
  } catch {
    return {};
  }
}

function entries(form: ActualForm): ProjectCostEntry[] {
  return [
    { id: "labour", kind: "labour", description: "Main-d’œuvre réelle", amount: form.labourCost, labourHours: form.labourHours },
    { id: "material", kind: "material", description: "Matières réelles", amount: form.materialCost },
    { id: "travel", kind: "travel", description: "Déplacements réels", amount: form.travelCost },
    { id: "subcontract", kind: "subcontract", description: "Sous-traitance réelle", amount: form.subcontractCost },
    { id: "other", kind: "other", description: "Autres coûts réels", amount: form.otherCost },
  ];
}

export default function MobileProjectProfitability() {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [form, setForm] = useState<ActualForm>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handler = () => {
      const nextWorkspace = readWorkspace();
      setWorkspace(nextWorkspace);
      const first = nextWorkspace?.quotes[0]?.id ?? "";
      setQuoteId(first);
      setForm(readActuals()[first] ?? EMPTY);
      setSaved(false);
      setOpen(true);
    };
    window.addEventListener("forgeo:open-project-profitability", handler);
    return () => window.removeEventListener("forgeo:open-project-profitability", handler);
  }, []);

  const quote = workspace?.quotes.find((item) => item.id === quoteId) ?? null;
  const profile = useMemo(() => typeof window === "undefined" ? null : readForgeoBusinessProfile(window.localStorage), [open]);
  const targetMargin = profile ? (getTradeProfile(profile).settings.targetMarginRate ?? 30) : 30;
  const result = useMemo(() => calculateProjectProfitability({
    revenueHt: quote?.subtotal ?? 0,
    entries: entries(form),
  }), [quote, form]);
  const signal = profitabilitySignal(result, targetMargin);

  function selectQuote(id: string) {
    setQuoteId(id);
    setForm(readActuals()[id] ?? EMPTY);
    setSaved(false);
  }

  function patch<K extends keyof ActualForm>(key: K, value: number) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    if (!quoteId) return;
    const actuals = readActuals();
    actuals[quoteId] = form;
    localStorage.setItem(ACTUALS_KEY, JSON.stringify(actuals));
    setSaved(true);
  }

  if (!open) return null;

  return (
    <div className="fpa-backdrop" role="dialog" aria-modal="true" aria-label="Rentabilité réelle chantier">
      <section className="fpa-sheet">
        <header><div><small>FORGEO · PILOTAGE</small><h2>Rentabilité réelle</h2></div><button onClick={() => setOpen(false)} aria-label="Fermer"><X size={21} /></button></header>
        <div className="fpa-scroll">
          {!workspace?.quotes.length ? <div className="fpa-empty">Aucun devis disponible dans le prototype.</div> : <>
            <label className="fpa-quote">Chantier / devis<select value={quoteId} onChange={(event) => selectQuote(event.target.value)}>{workspace.quotes.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.customerName} · {item.title}</option>)}</select></label>
            {quote && <div className="fpa-revenue"><span>Revenu HT du devis</span><strong>{money(quote.subtotal)}</strong></div>}
            <div className="fpa-grid">
              <label>Coût main-d’œuvre (€)<input inputMode="decimal" value={form.labourCost} onChange={(event) => patch("labourCost", numberValue(event.target.value))} /></label>
              <label>Heures réelles<input inputMode="decimal" value={form.labourHours} onChange={(event) => patch("labourHours", numberValue(event.target.value))} /></label>
              <label>Matières (€)<input inputMode="decimal" value={form.materialCost} onChange={(event) => patch("materialCost", numberValue(event.target.value))} /></label>
              <label>Déplacements (€)<input inputMode="decimal" value={form.travelCost} onChange={(event) => patch("travelCost", numberValue(event.target.value))} /></label>
              <label>Sous-traitance (€)<input inputMode="decimal" value={form.subcontractCost} onChange={(event) => patch("subcontractCost", numberValue(event.target.value))} /></label>
              <label>Autres coûts (€)<input inputMode="decimal" value={form.otherCost} onChange={(event) => patch("otherCost", numberValue(event.target.value))} /></label>
            </div>
            <section className={`fpa-result ${signal}`}>
              <div><span>Coût réel</span><strong>{money(result.actualCost)}</strong></div>
              <div><span>Marge réelle</span><strong>{money(result.actualMargin)}</strong></div>
              <div><span>Taux de marge</span><strong>{result.actualMarginRate} %</strong></div>
              <div><span>Objectif</span><strong>{targetMargin} %</strong></div>
              <p>{signal === "loss" ? "Chantier déficitaire : les coûts dépassent le revenu HT." : signal === "below_target" ? "La marge réelle est sous l’objectif de l’entreprise." : signal === "on_target" ? "La marge réelle atteint l’objectif de l’entreprise." : "Ajoutez les coûts réels pour piloter la rentabilité."}</p>
            </section>
          </>}
        </div>
        <footer><button className="fpa-save" disabled={!quoteId} onClick={save}><Check size={19} /> {saved ? "Coûts enregistrés" : "Enregistrer les coûts réels"}</button></footer>
      </section>
      <style>{`
        .fpa-backdrop{position:fixed;z-index:121000;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(9,24,40,.62);font-family:Arial,sans-serif;color:#102a43}.fpa-sheet{width:min(100%,650px);max-height:94dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:24px 24px 0 0;background:#f4f7fa}.fpa-sheet>header{display:flex;align-items:center;justify-content:space-between;padding:18px;background:#fff;border-bottom:1px solid #dce4ec}.fpa-sheet>header small{display:block;color:#3674a9;font-size:11px;font-weight:900;letter-spacing:.08em}.fpa-sheet>header h2{margin:4px 0 0;font-size:21px}.fpa-sheet>header button{width:40px;height:40px;border:0;border-radius:50%;background:#edf2f7;color:#102a43}.fpa-scroll{overflow:auto;padding:16px}.fpa-quote{display:block;font-size:12px;font-weight:800}.fpa-quote select,.fpa-grid input{box-sizing:border-box;width:100%;min-height:42px;margin-top:6px;padding:9px 10px;border:1px solid #bdcbd8;border-radius:10px;background:#fff;color:#102a43}.fpa-revenue{display:flex;align-items:center;justify-content:space-between;margin:13px 0;padding:14px;border-radius:14px;background:#eaf3fb}.fpa-revenue span{font-size:12px;font-weight:700}.fpa-revenue strong{font-size:17px}.fpa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fpa-grid label{font-size:11px;font-weight:800;color:#425b70}.fpa-result{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px;padding:15px;border-radius:16px;background:#fff;border:1px solid #dce5ed}.fpa-result div span,.fpa-result div strong{display:block}.fpa-result div span{font-size:11px;color:#607487}.fpa-result div strong{margin-top:3px;font-size:16px}.fpa-result p{grid-column:1/-1;margin:3px 0 0;font-size:12px;line-height:1.4}.fpa-result.loss{border-color:#e9b8b8;background:#fff5f5}.fpa-result.below_target{border-color:#e6d3a6;background:#fffaf0}.fpa-result.on_target{border-color:#b9dccb;background:#f2fbf6}.fpa-empty{padding:20px;border-radius:14px;background:#fff;color:#607487}.fpa-sheet>footer{padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #dce4ec}.fpa-save{width:100%;min-height:50px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;background:#176b4e;color:#fff;font:800 15px Arial,sans-serif}.fpa-save:disabled{background:#a8b7b1}.fpa-save svg{flex:0 0 auto}@media(max-width:500px){.fpa-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
