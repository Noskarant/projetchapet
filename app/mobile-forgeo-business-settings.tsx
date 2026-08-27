"use client";

import { Check, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  changePrimaryTrade,
  getTradeProfile,
  readForgeoBusinessProfile,
  upsertTradeProfile,
  writeForgeoBusinessProfile,
  type ForgeoBusinessProfile,
} from "@/lib/copilot/business-profile";
import { getCopilotTradePack, listAvailableCopilotTradePacks } from "@/lib/copilot/trade-packs";
import type { CopilotCatalogService, CopilotCompanySettings, CopilotTrade } from "@/lib/copilot/types";

type EditableService = Pick<CopilotCatalogService, "code" | "label" | "description" | "unit" | "unitPriceHt" | "materialCostPerUnit" | "labourHoursPerUnit" | "taxRate" | "source">;

type SettingsForm = {
  hourlyCost: number;
  targetMarginRate: number;
  defaultTaxRate: number;
  includeTravelFee: boolean;
};

const AVAILABLE_PACKS = listAvailableCopilotTradePacks();

function serviceCatalog(profile: ForgeoBusinessProfile, trade: CopilotTrade): EditableService[] {
  const pack = getCopilotTradePack(trade);
  const overrides = new Map(getTradeProfile(profile, trade).catalog.map((service) => [service.code, service]));
  return pack.defaultCatalog.map((service) => ({
    ...(overrides.get(service.code) ?? service),
    source: overrides.has(service.code) ? "company_catalog" : "template_default",
  }));
}

function settingsForm(profile: ForgeoBusinessProfile, trade: CopilotTrade): SettingsForm {
  const pack = getCopilotTradePack(trade);
  const stored = getTradeProfile(profile, trade).settings;
  return {
    hourlyCost: stored.hourlyCost ?? pack.defaultSettings.hourlyCost,
    targetMarginRate: stored.targetMarginRate ?? pack.defaultSettings.targetMarginRate,
    defaultTaxRate: stored.defaultTaxRate ?? pack.defaultSettings.defaultTaxRate,
    includeTravelFee: stored.includeTravelFee ?? pack.defaultSettings.includeTravelFee,
  };
}

function safeNumber(value: string, fallback: number, max: number) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback;
}

export default function MobileForgeoBusinessSettings() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ForgeoBusinessProfile | null>(null);
  const [trade, setTrade] = useState<CopilotTrade>("interior_painting");
  const [settings, setSettings] = useState<SettingsForm | null>(null);
  const [catalog, setCatalog] = useState<EditableService[]>([]);
  const pack = useMemo(() => getCopilotTradePack(trade), [trade]);

  function hydrate(nextTrade?: CopilotTrade) {
    const nextProfile = readForgeoBusinessProfile(window.localStorage);
    const selectedTrade = nextTrade ?? nextProfile.primaryTrade;
    setProfile(nextProfile);
    setTrade(selectedTrade);
    setSettings(settingsForm(nextProfile, selectedTrade));
    setCatalog(serviceCatalog(nextProfile, selectedTrade));
  }

  useEffect(() => {
    const openSettings = () => {
      hydrate();
      setOpen(true);
    };
    window.addEventListener("forgeo:open-business-settings", openSettings);
    return () => window.removeEventListener("forgeo:open-business-settings", openSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function selectTrade(nextTrade: CopilotTrade) {
    if (!profile) return;
    setTrade(nextTrade);
    setSettings(settingsForm(profile, nextTrade));
    setCatalog(serviceCatalog(profile, nextTrade));
  }

  function updateService(code: string, patch: Partial<EditableService>) {
    setCatalog((current) => current.map((service) => service.code === code ? { ...service, ...patch } : service));
  }

  function save() {
    if (!profile || !settings) return;
    const companyCatalog: CopilotCatalogService[] = catalog.map((service) => ({
      ...service,
      source: "company_catalog",
    }));
    let next = upsertTradeProfile(profile, trade, {
      settings: settings satisfies Partial<CopilotCompanySettings>,
      catalog: companyCatalog,
    });
    next = changePrimaryTrade(next, trade);
    writeForgeoBusinessProfile(next, window.localStorage);
    setProfile(next);
    window.dispatchEvent(new CustomEvent("forgeo:business-profile-updated", { detail: next }));
    setOpen(false);
  }

  if (!open || !profile || !settings) return null;

  return (
    <div className="fbs-backdrop" role="dialog" aria-modal="true" aria-label="Configuration métier FORGEO">
      <section className="fbs-sheet">
        <header>
          <div><small>FORGEO · PROFIL ENTREPRISE</small><h2>Métier et tarifs</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X size={21} /></button>
        </header>
        <div className="fbs-scroll">
          <section className="fbs-card">
            <label htmlFor="fbs-trade">Métier principal</label>
            <select id="fbs-trade" value={trade} onChange={(event) => selectTrade(event.target.value as CopilotTrade)}>
              {AVAILABLE_PACKS.map((item) => <option key={item.trade} value={item.trade}>{item.label}</option>)}
            </select>
            <p>{pack.description}</p>
          </section>

          <section className="fbs-card">
            <h3>Paramètres de rentabilité</h3>
            <div className="fbs-grid">
              <label>Coût horaire (€)<input inputMode="decimal" value={settings.hourlyCost} onChange={(event) => setSettings((current) => current ? { ...current, hourlyCost: safeNumber(event.target.value, current.hourlyCost, 500) } : current)} /></label>
              <label>Marge cible (%)<input inputMode="decimal" value={settings.targetMarginRate} onChange={(event) => setSettings((current) => current ? { ...current, targetMarginRate: safeNumber(event.target.value, current.targetMarginRate, 100) } : current)} /></label>
              <label>TVA par défaut<select value={settings.defaultTaxRate} onChange={(event) => setSettings((current) => current ? { ...current, defaultTaxRate: Number(event.target.value) } : current)}><option value={0}>0 %</option><option value={5.5}>5,5 %</option><option value={10}>10 %</option><option value={20}>20 %</option></select></label>
              <label className="fbs-check"><input type="checkbox" checked={settings.includeTravelFee} onChange={(event) => setSettings((current) => current ? { ...current, includeTravelFee: event.target.checked } : current)} /><span>Prévoir les déplacements quand le pack métier les utilise</span></label>
            </div>
          </section>

          <section className="fbs-card">
            <div className="fbs-card-title"><div><h3>Catalogue entreprise</h3><p>Les montants restent propres à votre entreprise. FORGEO n’invente jamais un prix absent.</p></div><Settings2 size={20} /></div>
            <div className="fbs-services">
              {catalog.map((service) => (
                <article key={service.code}>
                  <div className="fbs-service-head"><strong>{service.label}</strong><span>{service.unit}</span></div>
                  <small>{service.description}</small>
                  <div className="fbs-service-grid">
                    <label>Prix HT<input inputMode="decimal" value={service.unitPriceHt} onChange={(event) => updateService(service.code, { unitPriceHt: safeNumber(event.target.value, service.unitPriceHt, 100000) })} /></label>
                    <label>Coût matière<input inputMode="decimal" value={service.materialCostPerUnit} onChange={(event) => updateService(service.code, { materialCostPerUnit: safeNumber(event.target.value, service.materialCostPerUnit, 100000) })} /></label>
                    <label>Heures / unité<input inputMode="decimal" value={service.labourHoursPerUnit} onChange={(event) => updateService(service.code, { labourHoursPerUnit: safeNumber(event.target.value, service.labourHoursPerUnit, 1000) })} /></label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <footer><button type="button" className="fbs-save" onClick={save}><Check size={19} /> Enregistrer le profil métier</button></footer>
      </section>
      <style>{`
        .fbs-backdrop{position:fixed;z-index:120000;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(9,24,40,.62);font-family:Arial,sans-serif;color:#102a43}
        .fbs-sheet{width:min(100%,680px);max-height:96dvh;display:flex;flex-direction:column;border-radius:24px 24px 0 0;background:#f4f7fa;box-shadow:0 -18px 60px rgba(9,24,40,.32);overflow:hidden}
        .fbs-sheet>header{display:flex;align-items:center;justify-content:space-between;padding:18px;border-bottom:1px solid #dce4ec;background:#fff}.fbs-sheet>header small{display:block;color:#3674a9;font-size:11px;font-weight:900;letter-spacing:.08em}.fbs-sheet>header h2{margin:4px 0 0;font-size:21px}.fbs-sheet>header button{width:40px;height:40px;border:0;border-radius:50%;background:#edf2f7;color:#102a43}
        .fbs-scroll{overflow:auto;padding:16px}.fbs-card{margin-bottom:13px;padding:15px;border:1px solid #dce5ed;border-radius:16px;background:#fff}.fbs-card h3{margin:0 0 10px;font-size:15px}.fbs-card p{margin:7px 0 0;color:#607487;font-size:12px;line-height:1.4}.fbs-card>label{display:block;margin-bottom:7px;font-size:13px;font-weight:800}.fbs-card select,.fbs-card input{box-sizing:border-box;width:100%;min-height:42px;padding:9px 10px;border:1px solid #bdcbd8;border-radius:10px;background:#fff;color:#102a43;font:14px Arial,sans-serif}
        .fbs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fbs-grid label,.fbs-service-grid label{display:block;font-size:11px;font-weight:800;color:#425b70}.fbs-grid input,.fbs-grid select,.fbs-service-grid input{margin-top:5px}.fbs-check{grid-column:1/-1;display:flex!important;align-items:center;gap:9px;padding:10px;border-radius:10px;background:#f7fafc}.fbs-check input{width:18px;height:18px;min-height:0;margin:0}.fbs-card-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.fbs-card-title p{margin:0}.fbs-services{display:grid;gap:10px;margin-top:12px}.fbs-services article{padding:12px;border:1px solid #e1e8ef;border-radius:13px;background:#fbfdff}.fbs-service-head{display:flex;justify-content:space-between;gap:10px}.fbs-service-head strong{font-size:13px}.fbs-service-head span{font-size:11px;font-weight:900;color:#3674a9;text-transform:uppercase}.fbs-services article>small{display:block;margin:5px 0 10px;color:#607487;line-height:1.35}.fbs-service-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .fbs-sheet>footer{padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #dce4ec;background:#fff}.fbs-save{width:100%;min-height:50px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;background:#176b4e;color:#fff;font:800 15px Arial,sans-serif}
        @media(max-width:520px){.fbs-grid,.fbs-service-grid{grid-template-columns:1fr}.fbs-check{grid-column:auto}}
      `}</style>
    </div>
  );
}
