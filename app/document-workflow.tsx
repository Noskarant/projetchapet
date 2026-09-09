"use client";

import { Download, Eye, Loader2, Mail, Send, Settings2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sendAuthenticatedDocumentEmail } from "@/lib/authenticated-email";
import {
  buildDocumentEmailMessage,
  companyProfileDisplayName,
  defaultCompanyProfile,
  readCompanyProfile,
  type CompanyProfile,
} from "@/lib/company-profile";
import { blobToBase64, buildDocumentPdf, downloadDocumentPdf } from "@/lib/document-tools";
import { customerName, fetchWorkspace, type Invoice, type Quote } from "@/lib/project-chapet";

type BusinessDocument = Quote | Invoice;
type MailSettings = {
  copyInvoices: boolean;
  copyQuotes: boolean;
};

const SETTINGS_KEY = "forgeo.mail-settings.v2";
const defaults: MailSettings = {
  copyInvoices: true,
  copyQuotes: false,
};

function loadSettings(): MailSettings {
  if (typeof window === "undefined") return defaults;
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlMessage(profile: CompanyProfile, document: BusinessDocument) {
  const label = document.number.startsWith("DEV-") ? "Devis" : "Facture";
  const body = buildDocumentEmailMessage(profile, label, document.number)
    .split("\n")
    .map((line) => line ? `<p style="margin:0 0 10px">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>')
    .join("");
  const company = escapeHtml(companyProfileDisplayName(profile));
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17212f"><div style="font-size:12px;color:#5f7182;margin-bottom:16px">${company}</div><h2 style="color:#102a43;margin:0 0 18px">${escapeHtml(document.number)}</h2>${body}</div>`;
}

export default function DocumentWorkflow() {
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [activeNumber, setActiveNumber] = useState("");
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<BusinessDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<MailSettings>(defaults);
  const [profile, setProfile] = useState<CompanyProfile>(() => defaultCompanyProfile());

  const notify = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 5000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await fetchWorkspace();
      setDocuments([...data.quotes, ...data.invoices]);
    } catch {
      // L’interface principale affiche déjà les erreurs de connexion.
    }
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    setProfile(readCompanyProfile(window.localStorage));
    void reload();
    const onProfile = () => setProfile(readCompanyProfile(window.localStorage));
    window.addEventListener("projetchapet:company-profile-updated", onProfile);
    return () => window.removeEventListener("projetchapet:company-profile-updated", onProfile);
  }, [reload]);

  useEffect(() => {
    const inspect = () => {
      const modal = document.querySelector<HTMLElement>(".pc-crud-modal");
      const heading = modal?.querySelector("h2")?.textContent?.trim() ?? "";
      const isDocument = /^(DEV|FAC)-/i.test(heading);
      setActiveNumber(isDocument ? heading : "");
      setFooterTarget(isDocument ? modal?.querySelector<HTMLElement>("footer") ?? modal ?? null : null);
      setSettingsTarget(document.querySelector<HTMLElement>(".pc-settings-grid"));

      document.querySelectorAll<HTMLButtonElement>(".pc-ai-record").forEach((button) => {
        if (button.textContent?.includes("Groq")) button.innerHTML = "🎙️ Parler";
      });
      document.querySelectorAll<HTMLButtonElement>(".pc-ai-browser").forEach((button) => {
        if (button.textContent?.includes("navigateur")) button.innerHTML = "⌨️ Dicter rapidement";
      });
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const activeDocument = useMemo(
    () => documents.find((item) => item.number === activeNumber) ?? null,
    [documents, activeNumber],
  );

  async function openDocument(document: BusinessDocument, mode: "preview" | "send") {
    setBusy(true);
    try {
      const blob = await buildDocumentPdf(document);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setSelected(document);
      setRecipient(document.customer.emails?.[0] ?? "");
      const isInvoice = document.number.startsWith("FAC-");
      setCc(
        profile.accountingEmail && ((isInvoice && settings.copyInvoices) || (!isInvoice && settings.copyQuotes))
          ? profile.accountingEmail
          : "",
      );
      if (mode === "send" && !document.customer.emails?.[0]) notify("Ajoutez l’e-mail du client avant l’envoi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Aperçu PDF impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sendDocument() {
    if (!selected || !recipient.trim()) return notify("Indiquez l’adresse e-mail du client.");
    setBusy(true);
    try {
      const blob = await buildDocumentPdf(selected);
      const response = await sendAuthenticatedDocumentEmail({
        documentNumber: selected.number,
        documentKind: selected.number.startsWith("DEV-") ? "quote" : "invoice",
        to: recipient.trim(),
        cc: cc.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
        subject: `${selected.number.startsWith("DEV-") ? "Votre devis" : "Votre facture"} ${selected.number}`,
        html: htmlMessage(profile, selected),
        attachments: [{ filename: `${selected.number}.pdf`, content: await blobToBase64(blob) }],
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      notify(`Document envoyé à ${recipient.trim()}${cc ? " avec copie à la comptabilité" : ""}.`);
      setSelected(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  function saveMailSettings(next: MailSettings) {
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    notify("Réglages d’envoi enregistrés.");
  }

  return (
    <>
      {footerTarget && activeDocument && createPortal(
        <div className="pc-inline-document-tools">
          <button className="pc-primary pc-preview-primary" onClick={() => void openDocument(activeDocument, "preview")} disabled={busy}><Eye size={17} /> Aperçu PDF</button>
          <button className="pc-secondary" onClick={() => void openDocument(activeDocument, "send")} disabled={busy}><Send size={16} /> Envoyer au client</button>
          <button className="pc-secondary" onClick={() => void downloadDocumentPdf(activeDocument)}><Download size={16} /> Télécharger</button>
        </div>,
        footerTarget,
      )}

      {settingsTarget && createPortal(
        <section className="pc-panel pc-setting pc-mail-settings">
          <div className="pc-setting-title"><Settings2 size={20} /><div><h2>Envoi des documents</h2><p>Copies comptables et préférences d’envoi.</p></div></div>
          <div className="pc-form-grid">
            <label className="pc-span-2">E-mail comptable<input type="email" value={profile.accountingEmail} readOnly placeholder="À renseigner dans Mon entreprise" /></label>
            <label className="pc-check-setting"><input type="checkbox" checked={settings.copyInvoices} onChange={(event) => setSettings((current) => ({ ...current, copyInvoices: event.target.checked }))} /> Mettre automatiquement le comptable en copie des factures</label>
            <label className="pc-check-setting"><input type="checkbox" checked={settings.copyQuotes} onChange={(event) => setSettings((current) => ({ ...current, copyQuotes: event.target.checked }))} /> Le mettre aussi en copie des devis</label>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="pc-primary" onClick={() => saveMailSettings(settings)}>Enregistrer ces réglages</button>
            <button className="pc-secondary" onClick={() => window.dispatchEvent(new Event("projetchapet:open-company-profile"))}>Modifier le profil entreprise</button>
          </div>
        </section>,
        settingsTarget,
      )}

      {selected && (
        <div className="pc-document-preview-backdrop" role="dialog" aria-modal="true">
          <section className="pc-document-preview-modal">
            <header>
              <div>
                <span>Aperçu PDF</span>
                <h2>{selected.number}</h2>
                <p>{customerName(selected.customer)} · document tel qu’il sera envoyé au client</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Fermer"><X size={20} /></button>
            </header>
            <div className="pc-document-preview-body">
              <div className="pc-pdf-stage">
                <div className="pc-pdf-stage-label"><Eye size={16} /> Aperçu du document</div>
                <iframe src={previewUrl} title={`Aperçu ${selected.number}`} />
              </div>
              <aside>
                <div className="pc-send-panel-title"><Mail size={18} /><div><strong>Envoyer ce PDF</strong><span>Le fichier affiché à gauche sera joint à l’e-mail.</span></div></div>
                <label>E-mail du client<input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
                <label>Copie à<input type="text" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="comptable@cabinet.fr" /></label>
                <p>Pour votre sécurité, l’envoi est limité au client lié à ce document et à l’adresse comptable de votre entreprise.</p>
                <button className="pc-primary" onClick={() => void sendDocument()} disabled={busy || !recipient.trim()}>{busy ? <Loader2 size={16} className="pc-spin" /> : <Mail size={16} />} Envoyer le PDF</button>
                <button className="pc-secondary" onClick={() => void downloadDocumentPdf(selected)}><Download size={16} /> Télécharger le PDF</button>
              </aside>
            </div>
          </section>
        </div>
      )}

      {message && <div className="pc-document-toast">{message}</div>}
    </>
  );
}
