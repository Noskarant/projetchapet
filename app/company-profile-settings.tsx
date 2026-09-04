"use client";

import { Building2, Check, ImagePlus, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultCompanyProfile, readCompanyProfile, writeCompanyProfile, type CompanyProfile } from "@/lib/company-profile";

type LookupCompany = {
  companyName: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
};

function asDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture du logo impossible."));
    reader.readAsDataURL(file);
  });
}

export default function CompanyProfileSettings() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile>(() => defaultCompanyProfile());
  const [lookupBusy, setLookupBusy] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const openSettings = () => {
      setProfile(readCompanyProfile(window.localStorage));
      setOpen(true);
      setMessage("");
      fetch("/api/email", { cache: "no-store" })
        .then((response) => response.json())
        .then((data: { configured?: boolean }) => setEmailConfigured(Boolean(data.configured)))
        .catch(() => setEmailConfigured(false));
    };
    window.addEventListener("projetchapet:open-company-profile", openSettings);
    return () => window.removeEventListener("projetchapet:open-company-profile", openSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  async function lookup() {
    const siret = profile.siret.replace(/\D/g, "");
    if (siret.length !== 14) {
      setMessage("Renseignez les 14 chiffres du SIRET.");
      return;
    }
    setLookupBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/company-lookup?siret=${encodeURIComponent(siret)}`, { cache: "no-store" });
      const data = await response.json() as { company?: LookupCompany; error?: string };
      if (!response.ok || !data.company) throw new Error(data.error || "Entreprise introuvable.");
      setProfile((current) => ({
        ...current,
        legalName: data.company!.companyName || current.legalName,
        siret: data.company!.siret,
        vatNumber: data.company!.vatNumber || current.vatNumber,
        address: data.company!.address || current.address,
        postalCode: data.company!.postalCode || current.postalCode,
        city: data.company!.city || current.city,
      }));
      setMessage("Informations récupérées depuis le registre public des entreprises.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recherche impossible.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function chooseLogo(file: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setMessage("Utilisez un logo PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 550_000) {
      setMessage("Le logo doit faire moins de 550 Ko pour rester rapide sur mobile.");
      return;
    }
    try {
      const dataUrl = await asDataUrl(file);
      setProfile((current) => ({ ...current, logoDataUrl: dataUrl }));
      setMessage("Logo prêt à être enregistré.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo impossible à lire.");
    }
  }

  function save() {
    const saved = writeCompanyProfile(window.localStorage, profile);
    setProfile(saved);
    window.dispatchEvent(new CustomEvent("projetchapet:company-profile-updated", { detail: saved }));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="cps-backdrop" role="dialog" aria-modal="true" aria-label="Paramètres de l’entreprise">
      <section className="cps-panel">
        <header>
          <div><small>PROFIL ENTREPRISE</small><h2>Mon entreprise</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X size={21} /></button>
        </header>
        <div className="cps-scroll">
          <section className="cps-card">
            <div className="cps-title"><Building2 size={20} /><div><strong>Identité légale</strong><small>Utilisée pour les documents et les e-mails.</small></div></div>
            <label>Raison sociale<input value={profile.legalName} onChange={(event) => setProfile({ ...profile, legalName: event.target.value })} placeholder="Ex. Atelier Martin SARL" /></label>
            <div className="cps-siret"><label>SIRET<input inputMode="numeric" value={profile.siret} onChange={(event) => setProfile({ ...profile, siret: event.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder="14 chiffres" /></label><button type="button" onClick={() => void lookup()} disabled={lookupBusy}>{lookupBusy ? <Loader2 size={17} className="cps-spin" /> : <Search size={17} />} Rechercher</button></div>
            <label>TVA intracommunautaire<input value={profile.vatNumber} onChange={(event) => setProfile({ ...profile, vatNumber: event.target.value })} /></label>
            <label>Adresse<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></label>
            <div className="cps-two"><label>Code postal<input value={profile.postalCode} onChange={(event) => setProfile({ ...profile, postalCode: event.target.value })} /></label><label>Ville<input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label></div>
          </section>

          <section className="cps-card">
            <div className="cps-title"><ImagePlus size={20} /><div><strong>Logo</strong><small>Préparé pour l’identité des documents et messages.</small></div></div>
            <div className="cps-logo-row">{profile.logoDataUrl ? <img src={profile.logoDataUrl} alt="Logo de l’entreprise" /> : <div className="cps-logo-empty">Aucun logo</div>}<label className="cps-file">Choisir un fichier<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseLogo(event.target.files?.[0] ?? null)} /></label>{profile.logoDataUrl && <button type="button" className="cps-link" onClick={() => setProfile({ ...profile, logoDataUrl: "" })}>Retirer</button>}</div>
          </section>

          <section className="cps-card">
            <strong>Exercice comptable</strong>
            <p>Définissez le premier et le dernier jour de votre exercice.</p>
            <div className="cps-two"><label>Début (MM-JJ)<input value={profile.accountingStart} onChange={(event) => setProfile({ ...profile, accountingStart: event.target.value })} placeholder="01-01" /></label><label>Fin (MM-JJ)<input value={profile.accountingEnd} onChange={(event) => setProfile({ ...profile, accountingEnd: event.target.value })} placeholder="12-31" /></label></div>
          </section>

          <section className="cps-card">
            <strong>Message envoyé aux clients</strong>
            <label>Texte par défaut<textarea value={profile.emailIntro} onChange={(event) => setProfile({ ...profile, emailIntro: event.target.value })} /></label>
            <label>Signature<textarea value={profile.emailSignature} onChange={(event) => setProfile({ ...profile, emailSignature: event.target.value })} /></label>
            <div className={`cps-status ${emailConfigured ? "ok" : "warn"}`}><span>{emailConfigured ? "Envoi réel connecté" : "Envoi réel à configurer"}</span><small>{emailConfigured ? "Resend est prêt côté serveur." : "Ajoutez RESEND_API_KEY et RESEND_FROM_EMAIL sur le déploiement avant le test de Philippe."}</small></div>
          </section>
          {message && <div className="cps-message">{message}</div>}
        </div>
        <footer><button type="button" className="cps-secondary" onClick={() => setOpen(false)}>Annuler</button><button type="button" className="cps-primary" onClick={save}><Check size={17} /> Enregistrer</button></footer>
      </section>
      <style>{`
        .cps-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(3,9,25,.58);display:grid;place-items:center;padding:18px;font-family:Arial,sans-serif}.cps-panel{width:min(680px,100%);max-height:min(88dvh,820px);display:flex;flex-direction:column;background:#f7f9fc;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.28);color:#102a43}.cps-panel>header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#fff;border-bottom:1px solid #e3eaf2}.cps-panel>header small{font-size:10px;font-weight:900;letter-spacing:.12em;color:#50728e}.cps-panel>header h2{margin:3px 0 0;font-size:22px}.cps-panel>header button{border:0;background:#eef3f7;width:38px;height:38px;border-radius:50%;display:grid;place-items:center}.cps-scroll{overflow:auto;padding:14px;display:grid;gap:12px}.cps-card{background:#fff;border:1px solid #e0e8ef;border-radius:18px;padding:15px;display:grid;gap:11px}.cps-title{display:flex;gap:10px;align-items:center}.cps-title div{display:grid;gap:2px}.cps-title small,.cps-card p{margin:0;color:#6c7f90;font-size:12px}.cps-card label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#38536b}.cps-card input,.cps-card textarea{width:100%;box-sizing:border-box;border:1px solid #ccd8e3;border-radius:11px;background:#fff;padding:11px 12px;font:600 14px Arial,sans-serif;color:#102a43}.cps-card textarea{min-height:78px;resize:vertical}.cps-two,.cps-siret{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cps-siret{grid-template-columns:1fr auto;align-items:end}.cps-siret button,.cps-file{height:42px;border:0;border-radius:11px;background:#e8f0f8;color:#174f78;padding:0 14px;display:flex;align-items:center;justify-content:center;gap:7px;font-weight:800;font-size:12px;cursor:pointer}.cps-file input{display:none}.cps-logo-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cps-logo-row img,.cps-logo-empty{width:76px;height:52px;object-fit:contain;border:1px solid #dce5ed;border-radius:10px;background:#fff}.cps-logo-empty{display:grid;place-items:center;font-size:10px;color:#8192a2}.cps-link{border:0;background:transparent;color:#a23b3b;font-weight:800}.cps-status{border-radius:12px;padding:10px 12px;display:grid;gap:2px}.cps-status.ok{background:#edf9f2;color:#19603c}.cps-status.warn{background:#fff6e8;color:#86560e}.cps-status span{font-size:12px;font-weight:900}.cps-status small{font-size:11px}.cps-message{padding:10px 12px;border-radius:12px;background:#eaf2fb;color:#244e72;font-size:12px;font-weight:700}.cps-panel>footer{padding:13px 16px;background:#fff;border-top:1px solid #e3eaf2;display:flex;justify-content:flex-end;gap:9px}.cps-panel>footer button{min-height:42px;border-radius:11px;padding:0 16px;font-weight:900;border:1px solid #cbd8e4}.cps-primary{background:#174f78;color:#fff;border-color:#174f78!important;display:flex;align-items:center;gap:6px}.cps-secondary{background:#fff;color:#29475f}.cps-spin{animation:cps-spin .8s linear infinite}@keyframes cps-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.cps-backdrop{padding:0;place-items:end center}.cps-panel{max-height:94dvh;border-radius:22px 22px 0 0}.cps-two{grid-template-columns:1fr}.cps-siret{grid-template-columns:1fr}.cps-siret button{width:100%}}
      `}</style>
    </div>
  );
}
