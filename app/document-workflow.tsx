"use client";

import { Download, Eye, Loader2, Mail, Send, Settings2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { blobToBase64, buildDocumentPdf, downloadDocumentPdf } from "@/lib/document-tools";
import { customerName, fetchWorkspace, type Invoice, type Quote } from "@/lib/project-chapet";

type BusinessDocument = Quote | Invoice;
type MailSettings = {
  accountantEmail: string;
  copyInvoices: boolean;
  copyQuotes: boolean;
  senderName: string;
  defaultMessage: string;
};

const SETTINGS_KEY = "projetchapet.mail-settings.v1";
const defaults: MailSettings = {
  accountantEmail: "",
  copyInvoices: true,
  copyQuotes: false,
  senderName: "CHAPET SAS",
  defaultMessage: "Bonjour,\n\nVeuillez trouver votre document en pièce jointe.\n\nCordialement,",
};

function loadSettings(): MailSettings {
  if (typeof window === "undefined") return defaults;
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function htmlMessage(settings: MailSettings, document: BusinessDocument) {
  const escaped = settings.defaultMessage
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17212f"><h2 style="color:#102a43">${document.number}</h2><p>Bonjour,</p><p>${escaped}</p><p><strong>${settings.senderName}</strong></p></div>`;
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

  const notify = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 5000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await fetchWorkspace();
      setDocuments([...data.quotes, ...data.invoices]);
    } catch {
      // Le prototype principal affiche déjà les erreurs de connexion.
    }
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    void reload();
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

  function persistCopyAddress(value: string, document: BusinessDocument | null) {
    const normalized = value.trim();
    if (!normalized || !document) return;
    const isInvoice = document.number.startsWith("FAC-");
    const next: MailSettings = {
      ...settings,
      accountantEmail: normalized,
      copyInvoices: isInvoice ? true : settings.copyInvoices,
      copyQuotes: isInvoice ? settings.copyQuotes : true,
    };
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

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
        settings.accountantEmail && ((isInvoice && settings.copyInvoices) || (!isInvoice && settings.copyQuotes))
          ? settings.accountantEmail
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
      persistCopyAddress(cc, selected);
      const blob = await buildDocumentPdf(selected);
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          cc: cc.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
          subject: `${selected.number.startsWith("DEV-") ? "Votre devis" : "Votre facture"} ${selected.number}`,
          html: htmlMessage(settings, selected),
          attachments: [{ filename: `${selected.number}.pdf`, content: await blobToBase64(blob) }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      notify(`Document envoyé à ${recipient.trim()}${cc ? " avec copie" : ""}.`);
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
          <button className="pc-secondary" onClick={() => void openDocument(activeDocument, "preview")} disabled={busy}><Eye size={16} /> Aperçu PDF</button>
          <button className="pc-primary" onClick={() => void openDocument(activeDocument, "send")} disabled={busy}><Send size={16} /> Envoyer au client</button>
          <button className="pc-secondary" onClick={() => void downloadDocumentPdf(activeDocument)}><Download size={16} /> Télécharger</button>
        </div>,
        footerTarget,
      )}

      {settingsTarget && createPortal(
        <section className="pc-panel pc-setting pc-mail-settings">
          <div className="pc-setting-title"><Settings2 size={20} /><div><h2>Envoi des documents</h2><p>Destinataires automatiques et message des e-mails.</p></div></div>
          <div className="pc-form-grid">
            <label>Nom affiché<input value={settings.senderName} onChange={(event) => setSettings((current) => ({ ...current, senderName: event.target.value }))} /></label>
            <label>E-mail du comptable ou destinataire en copie<input type="email" value={settings.accountantEmail} onChange={(event) => setSettings((current) => ({ ...current, accountantEmail: event.target.value }))} placeholder="comptable@cabinet.fr" /></label>
            <label className="pc-check-setting"><input type="checkbox" checked={settings.copyInvoices} onChange={(event) => setSettings((current) => ({ ...current, copyInvoices: event.target.checked }))} /> Mettre automatiquement le comptable en copie des factures</label>
            <label className="pc-check-setting"><input type="checkbox" checked={settings.copyQuotes} onChange={(event) => setSettings((current) => ({ ...current, copyQuotes: event.target.checked }))} /> Le mettre aussi en copie des devis</label>
            <label className="pc-span-2">Message par défaut<textarea value={settings.defaultMessage} onChange={(event) => setSettings((current) => ({ ...current, defaultMessage: event.target.value }))} /></label>
          </div>
          <button className="pc-primary" onClick={() => saveMailSettings(settings)}>Enregistrer ces réglages</button>
        </section>,
        settingsTarget,
      )}

      {selected && (
        <div className="pc-document-preview-backdrop" role="dialog" aria-modal="true">
          <section className="pc-document-preview-modal">
            <header><div><span>Document prêt</span><h2>{selected.number}</h2><p>{customerName(selected.customer)}</p></div><button onClick={() => setSelected(null)} aria-label="Fermer"><X size={20} /></button></header>
            <div className="pc-document-preview-body">
              <iframe src={previewUrl} title={`Aperçu ${selected.number}`} />
              <aside>
                <label>E-mail du client<input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
                <label>Copie à<input type="text" value={cc} onChange={(event) => setCc(event.target.value)} onBlur={(event) => persistCopyAddress(event.target.value, selected)} placeholder="comptable@cabinet.fr" /></label>
                <p>Cette adresse sera mémorisée pour les prochains documents du même type. Le document est envoyé en PDF.</p>
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
