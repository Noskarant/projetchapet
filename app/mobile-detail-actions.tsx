"use client";

import {
  ArrowLeft,
  Check,
  Download,
  FileDown,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Send,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { blobToBase64, buildDocumentPdf } from "@/lib/document-tools";
import type { Customer, DocumentItem, Invoice as CoreInvoice, Quote as CoreQuote } from "@/lib/project-chapet";

type QuotePatch = {
  id: string;
  client: string;
  project: string;
  amount: string;
  issueDate: string;
  expiry: string;
};

type InvoicePatch = {
  id: string;
  client: string;
  amount: string;
  issueDate: string;
  due: string;
  status?: string;
};

type ClientPatch = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

type ConvertedInvoice = InvoicePatch & { sourceQuote?: string };

type EditState =
  | { kind: "quote"; value: QuotePatch }
  | { kind: "invoice"; value: InvoicePatch }
  | { kind: "client"; value: ClientPatch }
  | null;

type EmailState = {
  number: string;
  documentType: "devis" | "facture";
  recipient: string;
  subject: string;
  message: string;
  document: CoreQuote | CoreInvoice;
} | null;

type PreviewState = { number: string; url: string; blob: Blob } | null;

type SimpleState = { title: string; body: string; action?: string } | null;

const PATCHES_KEY = "projetchapet-mobile-patches-v1";
const CONVERTED_KEY = "projetchapet-mobile-converted-v1";
const DELETED_KEY = "projetchapet-mobile-deleted-v1";

const emailByClient: Record<string, string> = {
  "isabelle dechaud": "isabelle.dechaud@mail.fr",
  "francoise soulier": "f.soulier@mail.fr",
  "sci bellevue": "gestion@scibellevue.fr",
  "chapet pere & fils": "contact@saschapet.com",
  "alain tronchet immobilier": "contact@tronchet-immo.fr",
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

function normalize(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseEuro(value: string) {
  const normalized = value.replace(/\s/g, "").replace("€", "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(normalized || 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateToIso(value: string) {
  const months: Record<string, string> = {
    janv: "01", fevr: "02", mars: "03", avr: "04", mai: "05", juin: "06",
    juil: "07", aout: "08", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  const cleaned = normalize(value).replace(/^exp\. le\s+|^ech\. le\s+/, "");
  const match = cleaned.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!match) return todayIso();
  const month = months[match[2].slice(0, 4)] ?? "01";
  return `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}`;
}

function customerFor(name: string): Customer {
  const business = /SCI|SAS|SARL|IMMOBILIER|GARAGE|PERE|FILS/i.test(name);
  const key = normalize(name);
  return {
    id: `mobile-${key.replace(/[^a-z0-9]+/g, "-")}`,
    organization_id: "11111111-1111-4111-8111-111111111111",
    kind: business ? "business" : "individual",
    company_name: business ? name : null,
    civility: business ? null : "",
    last_name: business ? null : name,
    first_name: null,
    siret: business ? "879 214 563 00012" : null,
    vat_number: business ? "FR 12 879214563" : null,
    emails: [emailByClient[key] ?? "client@exemple.fr"],
    phones: [],
    addresses: [{ line1: "Adresse du chantier", postal_code: "42000", city: "Saint-Étienne", country: "France" }],
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeItems(label: string, totalTtc: number): { items: DocumentItem[]; subtotal: number; tax: number } {
  const subtotal = Math.round((totalTtc / 1.1) * 100) / 100;
  const tax = Math.round((totalTtc - subtotal) * 100) / 100;
  return {
    items: [{ position: 0, label: label || "Travaux de peinture et plâtrerie", description: "Prestation préparée depuis l’interface mobile.", quantity: 1, unit: "forfait", unit_price: subtotal, tax_rate: 10, total: subtotal }],
    subtotal,
    tax,
  };
}

function quoteDocument(value: QuotePatch): CoreQuote {
  const total = parseEuro(value.amount);
  const { items, subtotal, tax } = makeItems(value.project, total);
  return {
    id: value.id,
    organization_id: "11111111-1111-4111-8111-111111111111",
    customer_id: customerFor(value.client).id,
    number: value.id,
    title: value.project,
    status: "sent",
    issue_date: dateToIso(value.issueDate),
    expiry_date: dateToIso(value.expiry),
    subtotal,
    tax_total: tax,
    total,
    notes: "Devis valable deux mois. Sous réserve de validation définitive.",
    sent_at: new Date().toISOString(),
    accepted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: customerFor(value.client),
    items,
  };
}

function invoiceDocument(value: InvoicePatch): CoreInvoice {
  const total = parseEuro(value.amount);
  const { items, subtotal, tax } = makeItems("Travaux réalisés", total);
  return {
    id: value.id,
    organization_id: "11111111-1111-4111-8111-111111111111",
    customer_id: customerFor(value.client).id,
    quote_id: null,
    number: value.id,
    status: value.status === "Payée" ? "paid" : "issued",
    issue_date: dateToIso(value.issueDate),
    due_date: dateToIso(value.due),
    subtotal,
    tax_total: tax,
    total,
    paid_total: value.status === "Payée" ? total : 0,
    notes: "Merci pour votre confiance.",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: customerFor(value.client),
    items,
  };
}

function extractQuote(sheet: HTMLElement): QuotePatch {
  return {
    id: sheet.querySelector("header h2")?.textContent?.trim() ?? "D-2026-000",
    client: sheet.querySelector(".rm-detail-client strong")?.textContent?.trim() ?? "Client",
    amount: sheet.querySelector(".rm-detail-amount strong")?.textContent?.trim() ?? "0,00 €",
    project: sheet.querySelector(".rm-detail-amount span")?.textContent?.trim() ?? "Travaux",
    issueDate: sheet.querySelector(".rm-detail-dates > div:first-child strong")?.textContent?.trim() ?? "Aujourd’hui",
    expiry: sheet.querySelector(".rm-detail-dates > div:last-child strong")?.textContent?.trim() ?? "Dans 2 mois",
  };
}

function extractInvoice(sheet: HTMLElement): InvoicePatch {
  return {
    id: sheet.querySelector("header h2")?.textContent?.trim() ?? "F-2026-000",
    client: sheet.querySelector(".rm-detail-client strong")?.textContent?.trim() ?? "Client",
    amount: sheet.querySelector(".rm-detail-amount strong")?.textContent?.trim() ?? "0,00 €",
    issueDate: sheet.querySelector(".rm-detail-dates > div:first-child strong")?.textContent?.trim() ?? "Aujourd’hui",
    due: sheet.querySelector(".rm-detail-dates > div:last-child strong")?.textContent?.trim() ?? "Dans 30 jours",
    status: sheet.querySelector(".rm-status")?.textContent?.trim() ?? "En cours",
  };
}

function extractClient(sheet: HTMLElement): ClientPatch {
  const blocks = Array.from(sheet.querySelectorAll<HTMLElement>(".rm-client-fields > div"));
  const byTitle = (title: string) => blocks.find((block) => normalize(block.querySelector("span")?.textContent ?? "") === normalize(title));
  return {
    name: sheet.querySelector("header h2")?.textContent?.trim() ?? "Client",
    phone: byTitle("Téléphones")?.querySelector("strong")?.textContent?.trim() ?? "",
    email: byTitle("E-mails")?.querySelector("strong")?.textContent?.trim() ?? "",
    address: byTitle("Adresse")?.querySelector("strong")?.textContent?.trim() ?? "",
  };
}

async function buildNoPricePdf(value: QuotePatch) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("CHAPET SAS", 16, 18);
  pdf.setFontSize(18);
  pdf.text("DEVIS SANS PRIX", 194, 18, { align: "right" });
  pdf.setFontSize(10);
  pdf.text(value.id, 194, 25, { align: "right" });
  pdf.setDrawColor(210, 220, 232);
  pdf.line(16, 34, 194, 34);
  pdf.setFontSize(11);
  pdf.text("Client", 16, 46);
  pdf.setFont("helvetica", "normal");
  pdf.text(value.client, 16, 53);
  pdf.setFont("helvetica", "bold");
  pdf.text("Travaux à réaliser", 16, 70);
  pdf.setFont("helvetica", "normal");
  pdf.text(pdf.splitTextToSize(value.project || "Travaux", 175), 16, 78);
  pdf.setFontSize(9);
  pdf.setTextColor(90, 101, 117);
  pdf.text("Document interne destiné aux collaborateurs — aucun prix ni marge affiché.", 16, 103);
  pdf.text("Consignes : protéger les zones, contrôler les supports et photographier la fin de chantier.", 16, 111);
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

export default function MobileDetailActions() {
  const [edit, setEdit] = useState<EditState>(null);
  const [email, setEmail] = useState<EmailState>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [simple, setSimple] = useState<SimpleState>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [customInvoice, setCustomInvoice] = useState<ConvertedInvoice | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const patches = useMemo(() => {
    if (typeof window === "undefined") return { quotes: {} as Record<string, QuotePatch>, invoices: {} as Record<string, InvoicePatch>, clients: {} as Record<string, ClientPatch> };
    return readJson(PATCHES_KEY, { quotes: {}, invoices: {}, clients: {} });
  }, [edit, customInvoice]);

  const openPdf = useCallback(async (documentData: CoreQuote | CoreInvoice, noPrice?: QuotePatch) => {
    setBusy(true);
    try {
      const blob = noPrice ? await buildNoPricePdf(noPrice) : await buildDocumentPdf(documentData);
      const url = URL.createObjectURL(blob);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { number: documentData.number, url, blob };
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Impossible de générer le PDF.");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const openEmail = useCallback((documentData: CoreQuote | CoreInvoice) => {
    const isQuote = "title" in documentData;
    const recipient = documentData.customer.emails[0] ?? "";
    setEmail({
      number: documentData.number,
      documentType: isQuote ? "devis" : "facture",
      recipient,
      subject: `${isQuote ? "Votre devis" : "Votre facture"} ${documentData.number}`,
      message: `Bonjour,\n\nVeuillez trouver votre ${isQuote ? "devis" : "facture"} ${documentData.number} en pièce jointe.\n\nCordialement,\nCHAPET SAS`,
      document: documentData,
    });
  }, []);

  const applyPatches = useCallback(() => {
    const saved = readJson<{ quotes: Record<string, QuotePatch>; invoices: Record<string, InvoicePatch>; clients: Record<string, ClientPatch> }>(PATCHES_KEY, { quotes: {}, invoices: {}, clients: {} });
    const deleted = new Set(readJson<string[]>(DELETED_KEY, []));

    document.querySelectorAll<HTMLElement>(".rm-document-card").forEach((card) => {
      const id = card.querySelector("small")?.textContent?.trim() ?? "";
      if (deleted.has(id)) { card.style.display = "none"; return; }
      const quote = saved.quotes[id];
      const invoice = saved.invoices[id];
      const patch = quote ?? invoice;
      if (!patch) return;
      const leftStrong = card.querySelector<HTMLElement>(".rm-document-main strong");
      const amount = card.querySelector<HTMLElement>(".rm-document-side strong");
      const date = card.querySelector<HTMLElement>(".rm-document-side small");
      if (leftStrong) leftStrong.textContent = patch.client;
      if (amount) amount.textContent = patch.amount;
      if (date) date.textContent = "expiry" in patch ? patch.expiry : patch.due;
    });

    document.querySelectorAll<HTMLElement>(".rm-client-card").forEach((card) => {
      const currentName = card.querySelector("strong")?.textContent?.trim() ?? "";
      const patch = saved.clients[normalize(currentName)];
      if (!patch) return;
      const name = card.querySelector<HTMLElement>("strong");
      const phone = card.querySelector<HTMLElement>("div > span");
      if (name) name.textContent = patch.name;
      if (phone) phone.textContent = patch.phone;
    });

    const list = document.querySelector<HTMLElement>(".rm-content .rm-section .rm-list");
    const title = document.querySelector(".rm-header h1")?.textContent?.trim();
    if (list && title === "Factures") {
      const converted = readJson<ConvertedInvoice[]>(CONVERTED_KEY, []);
      converted.forEach((invoice) => {
        if (deleted.has(invoice.id) || list.querySelector(`[data-bridge-id="${invoice.id}"]`)) return;
        const button = document.createElement("button");
        button.className = "rm-document-card";
        button.dataset.bridgeId = invoice.id;
        button.innerHTML = `<div class="rm-document-main"><strong>${invoice.client}</strong><small>${invoice.id}</small><span class="rm-status rm-status-en-cours">${invoice.status ?? "En cours"}</span></div><div class="rm-document-side"><strong>${invoice.amount}</strong><small>${invoice.due}</small><span aria-hidden="true">›</span></div>`;
        button.addEventListener("click", () => setCustomInvoice(invoice));
        list.prepend(button);
      });
    }
  }, []);

  useEffect(() => {
    applyPatches();
    const observer = new MutationObserver(() => applyPatches());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [applyPatches, patches]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const element = event.target as Element | null;
      const button = element?.closest<HTMLButtonElement>("button");
      if (!button || button.closest(".mda-overlay")) return;
      const label = normalize(button.textContent ?? button.getAttribute("aria-label") ?? "");
      const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
      const sheetType = normalize(sheet?.querySelector("header small")?.textContent ?? "");

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      if (sheet && sheetType === "devis") {
        const quote = extractQuote(sheet);
        const documentData = quoteDocument(quote);
        if (label.includes("pdf complet")) { stop(); void openPdf(documentData); return; }
        if (label.includes("pdf sans prix")) { stop(); void openPdf(documentData, quote); return; }
        if (label.includes("envoyer par e-mail")) { stop(); openEmail(documentData); return; }
        if (label.includes("transformer en facture")) {
          stop();
          const existing = readJson<ConvertedInvoice[]>(CONVERTED_KEY, []);
          const nextNumber = `F-2026-${String(21 + existing.length).padStart(3, "0")}`;
          const converted: ConvertedInvoice = { id: nextNumber, client: quote.client, amount: quote.amount, issueDate: "30 juil. 2026", due: "Éch. le 30 août 2026", status: "En cours", sourceQuote: quote.id };
          writeJson(CONVERTED_KEY, [converted, ...existing.filter((item) => item.sourceQuote !== quote.id)]);
          button.closest(".rm-modal-backdrop")?.querySelector<HTMLButtonElement>("header button")?.click();
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes("Factures"))?.click();
          window.setTimeout(applyPatches, 220);
          notify(`Facture ${nextNumber} créée depuis ${quote.id}.`);
          return;
        }
        if (label.includes("modifier le devis") || (button.closest("header") && button.querySelector("svg") && !label)) {
          stop(); setEdit({ kind: "quote", value: quote }); return;
        }
      }

      if (sheet && sheetType === "facture") {
        const invoice = extractInvoice(sheet);
        const documentData = invoiceDocument(invoice);
        if (label.includes("modifier les dates") || (button.closest("header") && button.querySelector("svg") && !label)) { stop(); setEdit({ kind: "invoice", value: invoice }); return; }
        if (label.includes("envoyer au client")) { stop(); openEmail(documentData); return; }
        if (label.includes("renvoyer au comptable")) {
          stop();
          setEmail({ number: invoice.id, documentType: "facture", recipient: "compta@saschapet.com", subject: `Copie comptable ${invoice.id}`, message: `Bonjour,\n\nVeuillez trouver la facture ${invoice.id} en pièce jointe.\n\nCHAPET SAS`, document: documentData });
          return;
        }
        if (label.includes("creer un avoir")) {
          stop();
          const existing = readJson<ConvertedInvoice[]>(CONVERTED_KEY, []);
          const credit: ConvertedInvoice = { id: `A-2026-${String(existing.filter((item) => item.id.startsWith("A-")).length + 1).padStart(3, "0")}`, client: invoice.client, amount: `-${invoice.amount}`, issueDate: "30 juil. 2026", due: "Émis aujourd’hui", status: "En cours" };
          writeJson(CONVERTED_KEY, [credit, ...existing]);
          notify(`Avoir ${credit.id} créé.`);
          return;
        }
        if (label.includes("supprimer le brouillon")) {
          stop();
          if (!window.confirm(`Supprimer définitivement le brouillon ${invoice.id} ?`)) return;
          const deleted = readJson<string[]>(DELETED_KEY, []);
          writeJson(DELETED_KEY, Array.from(new Set([...deleted, invoice.id])));
          button.closest(".rm-modal-backdrop")?.querySelector<HTMLButtonElement>("header button")?.click();
          applyPatches();
          notify("Brouillon supprimé.");
          return;
        }
      }

      if (sheet && sheetType === "client") {
        const client = extractClient(sheet);
        if (label.includes("modifier le client") || (button.closest("header") && button.querySelector("svg") && !label)) { stop(); setEdit({ kind: "client", value: client }); return; }
        if (label.includes("voir les devis") || label.includes("voir les factures")) {
          stop();
          button.closest(".rm-modal-backdrop")?.querySelector<HTMLButtonElement>("header button")?.click();
          const destination = label.includes("devis") ? "Devis" : "Factures";
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes(destination))?.click();
          window.setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(".rm-search input");
            if (input) { input.value = client.name; input.dispatchEvent(new Event("input", { bubbles: true })); }
          }, 180);
          return;
        }
        if (label.includes("nouveau devis")) {
          stop();
          button.closest(".rm-modal-backdrop")?.querySelector<HTMLButtonElement>("header button")?.click();
          Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")).find((item) => item.textContent?.includes("Devis"))?.click();
          window.setTimeout(() => document.querySelector<HTMLButtonElement>(".rm-create-main")?.click(), 160);
          return;
        }
      }

      if (button.closest(".rm-agenda-list") && !label.includes("aujourd")) {
        stop();
        setSimple({ title: "Événement", body: button.textContent?.trim() ?? "Événement chantier", action: "Marquer comme terminé" });
        return;
      }

      if (label.includes("ajouter des photos")) {
        stop();
        const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true;
        input.onchange = () => notify(`${input.files?.length ?? 0} photo(s) ajoutée(s) au chantier.`);
        input.click(); return;
      }
      if (label.includes("signaler un probleme")) { stop(); setSimple({ title: "Signaler un problème", body: "Décrivez le problème rencontré sur le chantier.", action: "Envoyer le signalement" }); return; }
      if (label.includes("etape terminee")) { stop(); notify("Étape marquée comme terminée."); return; }
      if (label.includes("document sans prix")) {
        stop();
        const quote: QuotePatch = { id: "CHANTIER-SCI-BELLEVUE", client: "SCI Bellevue", project: "Peinture murs et plafond · 18 m²", amount: "0,00 €", issueDate: "30 juil. 2026", expiry: "—" };
        void openPdf(quoteDocument(quote), quote); return;
      }
      if (label.includes("modifier les informations") || label.includes("ouvrir tous les parametres")) {
        stop(); setSimple({ title: "Paramètres enregistrables", body: "Logo, couleur, SIRET, TVA, IBAN, exercice comptable et modèles d’e-mails peuvent être modifiés depuis cet écran.", action: "Enregistrer les paramètres" }); return;
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [applyPatches, notify, openEmail, openPdf]);

  function saveEdit() {
    if (!edit) return;
    const saved = readJson<{ quotes: Record<string, QuotePatch>; invoices: Record<string, InvoicePatch>; clients: Record<string, ClientPatch> }>(PATCHES_KEY, { quotes: {}, invoices: {}, clients: {} });
    if (edit.kind === "quote") saved.quotes[edit.value.id] = edit.value;
    if (edit.kind === "invoice") saved.invoices[edit.value.id] = edit.value;
    if (edit.kind === "client") saved.clients[normalize(edit.value.name)] = edit.value;
    writeJson(PATCHES_KEY, saved);
    setEdit(null);
    applyPatches();
    notify("Modifications enregistrées.");
  }

  async function sendEmail() {
    if (!email?.recipient.trim()) return;
    setBusy(true);
    try {
      const blob = await buildDocumentPdf(email.document);
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.recipient.trim(),
          subject: email.subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">${email.message.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join("")}</div>`,
          attachments: [{ filename: `${email.number}.pdf`, content: await blobToBase64(blob) }],
        }),
      });
      if (!response.ok) {
        downloadBlob(blob, `${email.number}.pdf`);
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

  return (
    <>
      {edit && <div className="mda-overlay"><section className="mda-sheet">
        <header><button onClick={() => setEdit(null)}><X size={21} /></button><div><small>MODIFICATION</small><h2>{edit.kind === "quote" ? edit.value.id : edit.kind === "invoice" ? edit.value.id : edit.value.name}</h2></div><span /></header>
        <div className="mda-form">
          {edit.kind !== "client" && <label>Client<input value={edit.value.client} onChange={(event) => edit.kind === "quote" ? setEdit({ kind: "quote", value: { ...edit.value, client: event.target.value } }) : setEdit({ kind: "invoice", value: { ...edit.value, client: event.target.value } })} /></label>}
          {edit.kind === "quote" && <><label>Objet du devis<input value={edit.value.project} onChange={(event) => setEdit({ kind: "quote", value: { ...edit.value, project: event.target.value } })} /></label><label>Montant TTC<input value={edit.value.amount} onChange={(event) => setEdit({ kind: "quote", value: { ...edit.value, amount: event.target.value } })} /></label><div className="mda-two"><label>Date d’émission<input value={edit.value.issueDate} onChange={(event) => setEdit({ kind: "quote", value: { ...edit.value, issueDate: event.target.value } })} /></label><label>Expiration<input value={edit.value.expiry} onChange={(event) => setEdit({ kind: "quote", value: { ...edit.value, expiry: event.target.value } })} /></label></div></>}
          {edit.kind === "invoice" && <><label>Montant TTC<input value={edit.value.amount} onChange={(event) => setEdit({ kind: "invoice", value: { ...edit.value, amount: event.target.value } })} /></label><div className="mda-two"><label>Date d’émission<input value={edit.value.issueDate} onChange={(event) => setEdit({ kind: "invoice", value: { ...edit.value, issueDate: event.target.value } })} /></label><label>Échéance<input value={edit.value.due} onChange={(event) => setEdit({ kind: "invoice", value: { ...edit.value, due: event.target.value } })} /></label></div></>}
          {edit.kind === "client" && <><label>Nom<input value={edit.value.name} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, name: event.target.value } })} /></label><label>Téléphone<input value={edit.value.phone} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, phone: event.target.value } })} /></label><label>E-mail<input value={edit.value.email} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, email: event.target.value } })} /></label><label>Adresse<textarea value={edit.value.address} onChange={(event) => setEdit({ kind: "client", value: { ...edit.value, address: event.target.value } })} /></label></>}
        </div>
        <footer><button className="mda-secondary" onClick={() => setEdit(null)}>Annuler</button><button className="mda-primary" onClick={saveEdit}><Check size={18} /> Enregistrer</button></footer>
      </section></div>}

      {email && <div className="mda-overlay"><section className="mda-sheet">
        <header><button onClick={() => setEmail(null)}><X size={21} /></button><div><small>ENVOI</small><h2>{email.number}</h2></div><span /></header>
        <div className="mda-form"><label>Destinataire<input type="email" value={email.recipient} onChange={(event) => setEmail({ ...email, recipient: event.target.value })} /></label><label>Objet<input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} /></label><label>Message<textarea rows={7} value={email.message} onChange={(event) => setEmail({ ...email, message: event.target.value })} /></label></div>
        <footer><button className="mda-secondary" onClick={() => setEmail(null)}>Annuler</button><button className="mda-primary" disabled={busy} onClick={() => void sendEmail()}>{busy ? <Loader2 className="mda-spin" size={18} /> : <Send size={18} />} Envoyer avec le PDF</button></footer>
      </section></div>}

      {preview && <div className="mda-overlay"><section className="mda-preview">
        <header><button onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><ArrowLeft size={21} /></button><div><small>APERÇU PDF</small><h2>{preview.number}</h2></div><div><button onClick={() => downloadBlob(preview.blob, `${preview.number}.pdf`)}><Download size={19} /></button><button onClick={() => void sharePreview()}><Share2 size={19} /></button></div></header>
        <iframe src={preview.url} title={`Aperçu ${preview.number}`} />
      </section></div>}

      {simple && <div className="mda-overlay"><section className="mda-confirm"><button className="mda-close" onClick={() => setSimple(null)}><X size={20} /></button><FileText size={32} /><h2>{simple.title}</h2><p>{simple.body}</p>{simple.action && <button className="mda-primary" onClick={() => { notify(`${simple.action} : effectué.`); setSimple(null); }}><Check size={18} /> {simple.action}</button>}</section></div>}

      {customInvoice && <div className="mda-overlay"><section className="mda-sheet">
        <header><button onClick={() => setCustomInvoice(null)}><ArrowLeft size={21} /></button><div><small>{customInvoice.id.startsWith("A-") ? "AVOIR" : "FACTURE"}</small><h2>{customInvoice.id}</h2></div><button onClick={() => setEdit({ kind: "invoice", value: customInvoice })}><Pencil size={19} /></button></header>
        <div className="mda-document"><span>Client</span><strong>{customInvoice.client}</strong><div><small>Montant TTC</small><b>{customInvoice.amount}</b></div><p>{customInvoice.sourceQuote ? `Créée depuis le devis ${customInvoice.sourceQuote}.` : "Document créé depuis l’interface mobile."}</p></div>
        <div className="mda-actions"><button onClick={() => void openPdf(invoiceDocument(customInvoice))}><FileDown size={18} /> PDF</button><button onClick={() => openEmail(invoiceDocument(customInvoice))}><Mail size={18} /> Envoyer</button><button onClick={() => { const updated = { ...customInvoice, status: "Payée" }; setCustomInvoice(updated); const list = readJson<ConvertedInvoice[]>(CONVERTED_KEY, []).map((item) => item.id === updated.id ? updated : item); writeJson(CONVERTED_KEY, list); notify("Facture marquée payée."); }}><Check size={18} /> Marquer payée</button><button className="danger" onClick={() => { const deleted = readJson<string[]>(DELETED_KEY, []); writeJson(DELETED_KEY, [...deleted, customInvoice.id]); setCustomInvoice(null); applyPatches(); notify("Document supprimé."); }}><Trash2 size={18} /> Supprimer</button></div>
      </section></div>}

      {busy && !email && !preview && <div className="mda-loading"><Loader2 className="mda-spin" size={24} /> Traitement…</div>}
      {toast && <div className="mda-toast"><Check size={18} />{toast}</div>}
    </>
  );
}
