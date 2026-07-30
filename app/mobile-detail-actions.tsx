"use client";

import { ArrowLeft, Check, Download, Loader2, Send, Share2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { blobToBase64 } from "@/lib/document-tools";

type DocType = "devis" | "facture";

type MobileDocument = {
  type: DocType;
  number: string;
  client: string;
  amount: string;
  project: string;
  issueDate: string;
  dueDate: string;
};

type ClientData = { name: string; phone: string; email: string; address: string };

type EditState =
  | { kind: "document"; value: MobileDocument }
  | { kind: "client"; value: ClientData }
  | null;

type EmailState = { document: MobileDocument; recipient: string; subject: string; message: string } | null;
type PreviewState = { number: string; blob: Blob; url: string } | null;

const CONVERTED_KEY = "projetchapet-converted-invoices";
const emailByClient: Record<string, string> = {
  "isabelle dechaud": "isabelle.dechaud@mail.fr",
  "françoise soulier": "f.soulier@mail.fr",
  "sci bellevue": "gestion@scibellevue.fr",
  "chapet père & fils": "contact@saschapet.com",
  "alain tronchet immobilier": "contact@tronchet-immo.fr",
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function text(root: ParentNode, selector: string, fallback = "") {
  return root.querySelector(selector)?.textContent?.trim() || fallback;
}

function parseDetail(sheet: HTMLElement): MobileDocument {
  const type = normalize(text(sheet, "header small")) === "facture" ? "facture" : "devis";
  return {
    type,
    number: text(sheet, "header h2", type === "devis" ? "D-2026-000" : "F-2026-000"),
    client: text(sheet, ".rm-detail-client strong", "Client"),
    amount: text(sheet, ".rm-detail-amount strong", "0,00 €"),
    project: type === "devis" ? text(sheet, ".rm-detail-amount span", "Travaux") : "Travaux réalisés",
    issueDate: text(sheet, ".rm-detail-dates > div:first-child strong", "Aujourd’hui"),
    dueDate: text(sheet, ".rm-detail-dates > div:last-child strong", type === "devis" ? "Dans 2 mois" : "Dans 30 jours"),
  };
}

function parseClient(sheet: HTMLElement): ClientData {
  const blocks = Array.from(sheet.querySelectorAll<HTMLElement>(".rm-client-fields > div"));
  const find = (label: string) => blocks.find((block) => normalize(text(block, "span")) === normalize(label));
  return {
    name: text(sheet, "header h2", "Client"),
    phone: text(find("Téléphones") || sheet, "strong"),
    email: text(find("E-mails") || sheet, "strong"),
    address: text(find("Adresse") || sheet, "strong"),
  };
}

function euroNumber(value: string) {
  return Number(value.replace(/\s/g, "").replace("€", "").replace(",", ".").replace(/[^0-9.-]/g, "") || 0);
}

async function createPdf(documentData: MobileDocument, hidePrices = false) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const total = euroNumber(documentData.amount);
  const subtotal = Math.round((total / 1.1) * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100;
  const money = (value: number) => `${value.toFixed(2).replace(".", ",")} €`;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("CHAPET SAS", 16, 18);
  pdf.setFontSize(18);
  pdf.text(hidePrices ? "DOCUMENT SANS PRIX" : documentData.type.toUpperCase(), 194, 18, { align: "right" });
  pdf.setFontSize(10);
  pdf.text(documentData.number, 194, 25, { align: "right" });
  pdf.setDrawColor(210, 220, 232);
  pdf.line(16, 34, 194, 34);

  pdf.setFontSize(10);
  pdf.text("Client", 16, 47);
  pdf.setFont("helvetica", "normal");
  pdf.text(documentData.client, 16, 54);
  pdf.setFont("helvetica", "bold");
  pdf.text("Document", 120, 47);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Émis le : ${documentData.issueDate}`, 120, 54);
  pdf.text(`${documentData.type === "devis" ? "Validité" : "Échéance"} : ${documentData.dueDate}`, 120, 61);

  pdf.setFont("helvetica", "bold");
  pdf.text("Prestation", 16, 82);
  pdf.setFont("helvetica", "normal");
  pdf.text(pdf.splitTextToSize(documentData.project, 110), 16, 90);
  if (!hidePrices) {
    pdf.text("Quantité : 1 forfait", 16, 108);
    pdf.text(`Total HT : ${money(subtotal)}`, 194, 108, { align: "right" });
    pdf.text(`TVA 10 % : ${money(tax)}`, 194, 116, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(`Total TTC : ${documentData.amount}`, 194, 126, { align: "right" });
  } else {
    pdf.setFontSize(9);
    pdf.setTextColor(90, 101, 117);
    pdf.text("Document destiné aux collaborateurs. Aucun prix ni aucune marge ne sont affichés.", 16, 112);
  }
  pdf.setFontSize(8);
  pdf.setTextColor(100, 110, 124);
  pdf.text("Document généré par le logiciel de gestion de l’entreprise.", 105, 288, { align: "center" });
  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function setNativeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function MobileDetailActions() {
  const [edit, setEdit] = useState<EditState>(null);
  const [email, setEmail] = useState<EmailState>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const openPreview = useCallback(async (documentData: MobileDocument, hidePrices = false) => {
    setBusy(true);
    try {
      const blob = await createPdf(documentData, hidePrices);
      const url = URL.createObjectURL(blob);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { number: documentData.number, blob, url };
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Impossible de générer le PDF.");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const openEmail = useCallback((documentData: MobileDocument, accountant = false) => {
    const recipient = accountant ? "compta@saschapet.com" : emailByClient[normalize(documentData.client)] || "client@exemple.fr";
    setEmail({
      document: documentData,
      recipient,
      subject: `${accountant ? "Copie comptable" : documentData.type === "devis" ? "Votre devis" : "Votre facture"} ${documentData.number}`,
      message: `Bonjour,\n\nVeuillez trouver ${documentData.type === "devis" ? "le devis" : "la facture"} ${documentData.number} en pièce jointe.\n\nCordialement,\nCHAPET SAS`,
    });
  }, []);

  const injectConvertedInvoices = useCallback(() => {
    if (text(document, ".rm-header h1") !== "Factures") return;
    const list = document.querySelector<HTMLElement>(".rm-content .rm-list");
    if (!list) return;
    const values = JSON.parse(window.localStorage.getItem(CONVERTED_KEY) || "[]") as MobileDocument[];
    values.forEach((invoice) => {
      if (list.querySelector(`[data-converted="${invoice.number}"]`)) return;
      const button = document.createElement("button");
      button.className = "rm-document-card";
      button.dataset.converted = invoice.number;
      button.innerHTML = `<div class="rm-document-main"><strong>${invoice.client}</strong><small>${invoice.number}</small><span class="rm-status rm-status-en-cours">En cours</span></div><div class="rm-document-side"><strong>${invoice.amount}</strong><small>${invoice.dueDate}</small><span>›</span></div>`;
      button.onclick = () => setEdit({ kind: "document", value: invoice });
      list.prepend(button);
    });
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(injectConvertedInvoices);
    observer.observe(document.body, { childList: true, subtree: true });
    injectConvertedInvoices();
    return () => observer.disconnect();
  }, [injectConvertedInvoices]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const element = event.target as Element | null;
      const button = element?.closest<HTMLButtonElement>("button");
      if (!button || button.closest(".mda-overlay")) return;
      const label = normalize(button.textContent || button.getAttribute("aria-label") || "");
      const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (!sheet) return;
      const sheetType = normalize(text(sheet, "header small"));

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      if (sheetType === "devis") {
        const value = parseDetail(sheet);
        if (label.includes("pdf complet")) { stop(); void openPreview(value); return; }
        if (label.includes("pdf sans prix")) { stop(); void openPreview(value, true); return; }
        if (label.includes("envoyer par e-mail")) { stop(); openEmail(value); return; }
        if (label.includes("transformer en facture")) {
          stop();
          const stored = JSON.parse(window.localStorage.getItem(CONVERTED_KEY) || "[]") as MobileDocument[];
          const invoice: MobileDocument = {
            ...value,
            type: "facture",
            number: `F-2026-${String(21 + stored.length).padStart(3, "0")}`,
            issueDate: "30 juil. 2026",
            dueDate: "Éch. le 30 août 2026",
          };
          window.localStorage.setItem(CONVERTED_KEY, JSON.stringify([invoice, ...stored.filter((item) => item.number !== invoice.number)]));
          sheet.querySelector<HTMLButtonElement>("header button")?.click();
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes("Factures"))?.click();
          window.setTimeout(injectConvertedInvoices, 180);
          notify(`Facture ${invoice.number} créée.`);
          return;
        }
        const isPencil = button.closest("header") && button !== sheet.querySelector("header button:first-child");
        if (label.includes("modifier le devis") || isPencil) { stop(); setEdit({ kind: "document", value }); return; }
      }

      if (sheetType === "facture") {
        const value = parseDetail(sheet);
        if (label.includes("modifier les dates")) { stop(); setEdit({ kind: "document", value }); return; }
        if (label.includes("envoyer au client")) { stop(); openEmail(value); return; }
        if (label.includes("renvoyer au comptable")) { stop(); openEmail(value, true); return; }
        if (label.includes("creer un avoir")) {
          stop();
          const stored = JSON.parse(window.localStorage.getItem(CONVERTED_KEY) || "[]") as MobileDocument[];
          const credit: MobileDocument = { ...value, number: `A-2026-${String(stored.filter((item) => item.number.startsWith("A-")).length + 1).padStart(3, "0")}`, amount: `-${value.amount}` };
          window.localStorage.setItem(CONVERTED_KEY, JSON.stringify([credit, ...stored]));
          notify(`Avoir ${credit.number} créé.`);
          return;
        }
        if (label.includes("supprimer le brouillon")) {
          stop();
          if (window.confirm(`Supprimer le brouillon ${value.number} ?`)) {
            sheet.querySelector<HTMLButtonElement>("header button")?.click();
            document.querySelectorAll<HTMLElement>(".rm-document-card").forEach((card) => {
              if (text(card, "small") === value.number) card.remove();
            });
            notify("Brouillon supprimé.");
          }
          return;
        }
        const isPencil = button.closest("header") && button !== sheet.querySelector("header button:first-child");
        if (isPencil) { stop(); setEdit({ kind: "document", value }); return; }
      }

      if (sheetType === "client") {
        const value = parseClient(sheet);
        const isPencil = button.closest("header") && button !== sheet.querySelector("header button:first-child");
        if (label.includes("modifier le client") || isPencil) { stop(); setEdit({ kind: "client", value }); return; }
        if (label.includes("voir les devis") || label.includes("voir les factures")) {
          stop();
          sheet.querySelector<HTMLButtonElement>("header button")?.click();
          const destination = label.includes("devis") ? "Devis" : "Factures";
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes(destination))?.click();
          window.setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(".rm-search input");
            if (input) setNativeInput(input, value.name);
          }, 180);
          return;
        }
        if (label.includes("nouveau devis")) {
          stop();
          sheet.querySelector<HTMLButtonElement>("header button")?.click();
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes("Devis"))?.click();
          window.setTimeout(() => document.querySelector<HTMLButtonElement>(".rm-create-main")?.click(), 180);
        }
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [injectConvertedInvoices, notify, openEmail, openPreview]);

  function saveEdit() {
    if (!edit) return;
    if (edit.kind === "document") {
      const sheet = document.querySelector<HTMLElement>(".rm-detail-sheet");
      if (sheet) {
        const client = sheet.querySelector<HTMLElement>(".rm-detail-client strong");
        const amount = sheet.querySelector<HTMLElement>(".rm-detail-amount strong");
        const project = sheet.querySelector<HTMLElement>(".rm-detail-amount span");
        const issue = sheet.querySelector<HTMLElement>(".rm-detail-dates > div:first-child strong");
        const due = sheet.querySelector<HTMLElement>(".rm-detail-dates > div:last-child strong");
        if (client) client.textContent = edit.value.client;
        if (amount) amount.textContent = edit.value.amount;
        if (project && edit.value.type === "devis") project.textContent = edit.value.project;
        if (issue) issue.textContent = edit.value.issueDate;
        if (due) due.textContent = edit.value.dueDate;
      }
      document.querySelectorAll<HTMLElement>(".rm-document-card").forEach((card) => {
        if (text(card, "small") !== edit.value.number) return;
        const client = card.querySelector<HTMLElement>(".rm-document-main strong");
        const amount = card.querySelector<HTMLElement>(".rm-document-side strong");
        const due = card.querySelector<HTMLElement>(".rm-document-side small");
        if (client) client.textContent = edit.value.client;
        if (amount) amount.textContent = edit.value.amount;
        if (due) due.textContent = edit.value.dueDate;
      });
    } else {
      const sheet = document.querySelector<HTMLElement>(".rm-detail-sheet");
      if (sheet) {
        const name = sheet.querySelector<HTMLElement>("header h2");
        if (name) name.textContent = edit.value.name;
        const blocks = Array.from(sheet.querySelectorAll<HTMLElement>(".rm-client-fields > div"));
        const update = (label: string, value: string) => {
          const block = blocks.find((item) => normalize(text(item, "span")) === normalize(label));
          const strong = block?.querySelector<HTMLElement>("strong");
          if (strong) strong.textContent = value;
        };
        update("Téléphones", edit.value.phone);
        update("E-mails", edit.value.email);
        update("Adresse", edit.value.address);
      }
    }
    setEdit(null);
    notify("Modifications enregistrées.");
  }

  async function sendEmail() {
    if (!email) return;
    setBusy(true);
    try {
      const blob = await createPdf(email.document);
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.recipient,
          subject: email.subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">${email.message.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join("")}</div>`,
          attachments: [{ filename: `${email.document.number}.pdf`, content: await blobToBase64(blob) }],
        }),
      });
      if (!response.ok) {
        downloadBlob(blob, `${email.document.number}.pdf`);
        window.location.href = `mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.message)}`;
        notify("PDF téléchargé : joignez-le au message ouvert.");
      } else {
        notify(`Document envoyé à ${email.recipient}.`);
      }
      setEmail(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sharePreview() {
    if (!preview) return;
    const file = new File([preview.blob], `${preview.number}.pdf`, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: preview.number, files: [file] });
    } else {
      downloadBlob(preview.blob, `${preview.number}.pdf`);
    }
  }

  return <>
    {edit && <div className="mda-overlay"><section className="mda-sheet">
      <header><button onClick={() => setEdit(null)}><X size={21} /></button><div><small>MODIFICATION</small><h2>{edit.kind === "document" ? edit.value.number : edit.value.name}</h2></div><span /></header>
      <div className="mda-form">
        {edit.kind === "document" ? <>
          <label>Client<input value={edit.value.client} onChange={(event) => setEdit({ kind: "document", value: { ...edit.value, client: event.target.value } })} /></label>
          {edit.value.type === "devis" && <label>Objet<input value={edit.value.project} onChange={(event) => setEdit({ kind: "document", value: { ...edit.value, project: event.target.value } })} /></label>}
          <label>Montant TTC<input value={edit.value.amount} onChange={(event) => setEdit({ kind: "document", value: { ...edit.value, amount: event.target.value } })} /></label>
          <div className="mda-two"><label>Date d’émission<input value={edit.value.issueDate} onChange={(event) => setEdit({ kind: "document", value: { ...edit.value, issueDate: event.target.value } })} /></label><label>{edit.value.type === "devis" ? "Validité" : "Échéance"}<input value={edit.value.dueDate} onChange={(event) => setEdit({ kind: "document", value: { ...edit.value, dueDate: event.target.value } })} /></label></div>
        </> : <>
          <label>Nom<input value={edit.value.name} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, name: event.target.value } })} /></label>
          <label>Téléphone<input value={edit.value.phone} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, phone: event.target.value } })} /></label>
          <label>E-mail<input value={edit.value.email} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, email: event.target.value } })} /></label>
          <label>Adresse<textarea value={edit.value.address} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, address: event.target.value } })} /></label>
        </>}
      </div>
      <footer><button className="mda-secondary" onClick={() => setEdit(null)}>Annuler</button><button className="mda-primary" onClick={saveEdit}><Check size={18} /> Enregistrer</button></footer>
    </section></div>}

    {email && <div className="mda-overlay"><section className="mda-sheet">
      <header><button onClick={() => setEmail(null)}><X size={21} /></button><div><small>ENVOI</small><h2>{email.document.number}</h2></div><span /></header>
      <div className="mda-form"><label>Destinataire<input type="email" value={email.recipient} onChange={(event) => setEmail({ ...email, recipient: event.target.value })} /></label><label>Objet<input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} /></label><label>Message<textarea rows={7} value={email.message} onChange={(event) => setEmail({ ...email, message: event.target.value })} /></label></div>
      <footer><button className="mda-secondary" onClick={() => setEmail(null)}>Annuler</button><button className="mda-primary" onClick={() => void sendEmail()} disabled={busy}>{busy ? <Loader2 size={18} className="mda-spin" /> : <Send size={18} />} Envoyer avec le PDF</button></footer>
    </section></div>}

    {preview && <div className="mda-overlay"><section className="mda-preview">
      <header><button onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><ArrowLeft size={21} /></button><div><small>APERÇU PDF</small><h2>{preview.number}</h2></div><div><button onClick={() => downloadBlob(preview.blob, `${preview.number}.pdf`)}><Download size={19} /></button><button onClick={() => void sharePreview()}><Share2 size={19} /></button></div></header>
      <iframe src={preview.url} title={`Aperçu ${preview.number}`} />
    </section></div>}

    {busy && !email && !preview && <div className="mda-loading"><Loader2 size={24} className="mda-spin" /> Traitement…</div>}
    {toast && <div className="mda-toast"><Check size={18} />{toast}</div>}
  </>;
}
