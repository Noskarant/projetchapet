"use client";

import {
  AlertTriangle, ArrowLeft, BarChart3, Bell, Building2, CalendarDays, Camera, Check, CheckCircle2,
  ChevronRight, CircleUserRound, Clock3, Download, FileDown, FileText, Home, Loader2, Mail, Menu,
  Mic, Palette, Pencil, Plus, ReceiptText, RefreshCw, Search, Send, Settings, Share2, Trash2,
  UsersRound, Wrench, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobToBase64 } from "@/lib/document-tools";
import {
  calculateTotals, convertQuoteToInvoice, createCreditNote, customerDisplayName, deleteInvoiceFromWorkspace,
  deleteQuoteFromWorkspace, filterAgenda, makeId, nextNumber, seedMobileWorkspace, upsertAgenda, upsertCustomer,
  upsertInvoice, upsertQuote, type AgendaFilter, type AgendaType, type InvoiceStatus, type LineItem,
  type MobileAgendaEntry, type MobileCustomer, type MobileInvoice, type MobileQuote, type MobileWorkspace,
  type QuoteStatus,
} from "@/lib/mobile-prototype";

type Tab = "home" | "quotes" | "invoices" | "clients" | "agenda";
type Drawer = "menu" | "collaborators" | "company" | "accounting" | "settings" | null;
type BusinessDocument = MobileQuote | MobileInvoice;
type Editor =
  | { kind: "quote"; value: MobileQuote; isNew: boolean }
  | { kind: "invoice"; value: MobileInvoice; isNew: boolean }
  | { kind: "customer"; value: MobileCustomer; isNew: boolean }
  | { kind: "agenda"; value: MobileAgendaEntry; isNew: boolean }
  | null;
type PreviewState = { document: BusinessDocument; withoutPrices: boolean; blob: Blob; url: string } | null;
type EmailState = { document: BusinessDocument; withoutPrices: boolean; recipient: string; subject: string; message: string } | null;
type PdfChoice = { document: BusinessDocument; mode: "email" | "preview" } | null;

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const dateFr = (value: string) => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "—";
const isQuote = (value: BusinessDocument): value is MobileQuote => "expiryDate" in value;
const cloneLines = (items: LineItem[]) => items.map((item) => ({ ...item, id: makeId("line") }));
const emptyLine = (): LineItem => ({ id: makeId("line"), label: "", description: "", quantity: 1, unit: "u", unitPrice: 0, taxRate: 20 });

function StatusPill({ status }: { status: QuoteStatus | InvoiceStatus }) {
  const slug = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-");
  return <span className={`rm-status rm-status-${slug}`}>{status}</span>;
}

async function buildPdf(documentData: BusinessDocument, withoutPrices = false) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("CHAPET SAS", 16, y);
  pdf.setFontSize(18); pdf.text(isQuote(documentData) ? "DEVIS" : documentData.status === "Avoir" ? "AVOIR" : "FACTURE", 194, y, { align: "right" });
  pdf.setFontSize(10); pdf.text(documentData.number, 194, y + 7, { align: "right" });
  y += 25; pdf.setDrawColor(215, 223, 233); pdf.line(16, y, 194, y); y += 9;
  pdf.setFontSize(10); pdf.text("Client", 16, y); pdf.setFont("helvetica", "normal"); pdf.text(documentData.customerName, 16, y + 6);
  pdf.setFont("helvetica", "bold"); pdf.text("Document", 122, y); pdf.setFont("helvetica", "normal");
  pdf.text(`Émis le : ${dateFr(documentData.issueDate)}`, 122, y + 6);
  pdf.text(isQuote(documentData) ? `Valable jusqu’au : ${dateFr(documentData.expiryDate)}` : `Échéance : ${dateFr(documentData.dueDate)}`, 122, y + 12);
  y += 27;
  pdf.setFillColor(239, 245, 251); pdf.rect(16, y, 178, 9, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
  pdf.text("Désignation", 18, y + 6); pdf.text("Qté", 120, y + 6, { align: "right" });
  if (!withoutPrices) { pdf.text("PU HT", 148, y + 6, { align: "right" }); pdf.text("TVA", 165, y + 6, { align: "right" }); pdf.text("Total HT", 192, y + 6, { align: "right" }); }
  y += 13; pdf.setFont("helvetica", "normal");
  for (const item of documentData.items) {
    if (y > 255) { pdf.addPage(); y = 18; }
    const lines = pdf.splitTextToSize(item.label || "Prestation", 90); pdf.text(lines, 18, y);
    pdf.text(`${item.quantity} ${item.unit}`.trim(), 120, y, { align: "right" });
    if (!withoutPrices) { pdf.text(money(item.unitPrice), 148, y, { align: "right" }); pdf.text(`${item.taxRate} %`, 165, y, { align: "right" }); pdf.text(money(item.quantity * item.unitPrice), 192, y, { align: "right" }); }
    if (item.description) { pdf.setTextColor(95, 108, 124); pdf.setFontSize(7.5); pdf.text(pdf.splitTextToSize(item.description, 90), 18, y + 5); pdf.setTextColor(0, 0, 0); pdf.setFontSize(8.5); }
    y += Math.max(11, lines.length * 4.5 + (item.description ? 5 : 0)); pdf.setDrawColor(235, 239, 244); pdf.line(16, y - 4, 194, y - 4);
  }
  if (!withoutPrices) {
    y += 5; pdf.text("Sous-total HT", 134, y); pdf.text(money(documentData.subtotal), 192, y, { align: "right" });
    y += 7; pdf.text("TVA", 134, y); pdf.text(money(documentData.taxTotal), 192, y, { align: "right" });
    y += 8; pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Total TTC", 134, y); pdf.text(money(documentData.total), 192, y, { align: "right" });
  } else {
    y += 8; pdf.setFont("helvetica", "bold"); pdf.text("Document interne sans prix", 16, y);
  }
  if (documentData.notes) { y += 14; pdf.setFontSize(9); pdf.setFont("helvetica", "bold"); pdf.text("Notes", 16, y); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(documentData.notes, 176), 16, y + 6); }
  pdf.setFontSize(7.5); pdf.setTextColor(100, 110, 124); pdf.text("Document généré par CHAPET SAS.", 105, 288, { align: "center" });
  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function RappidosMobileShellV2() {
  const [workspace, setWorkspace] = useState<MobileWorkspace>(() => seedMobileWorkspace());
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("quotes");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [quoteFilter, setQuoteFilter] = useState<"Tous" | QuoteStatus>("Tous");
  const [invoiceFilter, setInvoiceFilter] = useState<"Toutes" | InvoiceStatus>("Toutes");
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>("today");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [email, setEmail] = useState<EmailState>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [pdfChoice, setPdfChoice] = useState<PdfChoice>(null);
  const [toast, setToast] = useState("");
  const [utility, setUtility] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    try { const stored = window.localStorage.getItem(STORAGE_KEY); if (stored) setWorkspace(JSON.parse(stored) as MobileWorkspace); } catch { /* seed conservé */ }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); }, [workspace, hydrated]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const notify = useCallback((message: string) => {
    setToast(message); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const selectedQuote = workspace.quotes.find((item) => item.id === selectedQuoteId) ?? null;
  const selectedInvoice = workspace.invoices.find((item) => item.id === selectedInvoiceId) ?? null;
  const selectedCustomer = workspace.customers.find((item) => item.id === selectedCustomerId) ?? null;

  const filteredQuotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspace.quotes.filter((quote) => (!term || `${quote.customerName} ${quote.number} ${quote.title} ${quote.total}`.toLowerCase().includes(term)) && (quoteFilter === "Tous" || quote.status === quoteFilter));
  }, [workspace.quotes, query, quoteFilter]);
  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspace.invoices.filter((invoice) => (!term || `${invoice.customerName} ${invoice.number} ${invoice.title} ${invoice.total}`.toLowerCase().includes(term)) && (invoiceFilter === "Toutes" || invoice.status === invoiceFilter));
  }, [workspace.invoices, query, invoiceFilter]);
  const filteredCustomers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspace.customers.filter((customer) => !term || `${customerDisplayName(customer)} ${customer.city} ${customer.emails.join(" ")} ${customer.phones.join(" ")}`.toLowerCase().includes(term));
  }, [workspace.customers, query]);
  const filteredAgenda = useMemo(() => filterAgenda(workspace.agenda, agendaFilter), [workspace.agenda, agendaFilter]);

  function switchTab(next: Tab) { setTab(next); setQuery(""); setDrawer(null); setQuoteFilter("Tous"); setInvoiceFilter("Toutes"); }
  function findCustomerName(id: string) { const customer = workspace.customers.find((item) => item.id === id); return customer ? customerDisplayName(customer) : "Client à sélectionner"; }

  function newQuote(prefill?: Partial<MobileQuote>) {
    const issueDate = todayIso();
    const customerId = prefill?.customerId || workspace.customers[0]?.id || "";
    setEditor({ kind: "quote", isNew: true, value: {
      id: makeId("quote"), number: nextNumber(workspace.quotes, "D"), customerId, customerName: findCustomerName(customerId), title: "Travaux",
      issueDate, expiryDate: addDays(issueDate, 60), status: "En attente", items: [emptyLine()], notes: "", subtotal: 0, taxTotal: 0, total: 0, ...prefill,
    }});
  }
  function newInvoice(prefill?: Partial<MobileInvoice>) {
    const issueDate = todayIso(); const customerId = prefill?.customerId || workspace.customers[0]?.id || "";
    setEditor({ kind: "invoice", isNew: true, value: {
      id: makeId("invoice"), number: nextNumber(workspace.invoices, "F"), customerId, customerName: findCustomerName(customerId), title: "Travaux réalisés",
      issueDate, dueDate: addDays(issueDate, 30), status: "Brouillon", items: [emptyLine()], notes: "", subtotal: 0, taxTotal: 0, total: 0,
      paidTotal: 0, accountantSent: false, ...prefill,
    }});
  }
  function newCustomer(prefill?: Partial<MobileCustomer>) {
    setEditor({ kind: "customer", isNew: true, value: { id: makeId("customer"), kind: "Professionnel", companyName: "", civility: "M.", lastName: "", firstName: "", emails: ["", ""], phones: ["", ""], address: "", postalCode: "", city: "", siret: "", vat: "", notes: "", ...prefill }});
  }
  function newAgenda(prefill?: Partial<MobileAgendaEntry>) {
    const customerId = prefill?.customerId || workspace.customers[0]?.id || "";
    setEditor({ kind: "agenda", isNew: true, value: { id: makeId("agenda"), date: todayIso(), time: "09:00", type: "Chantier", title: "", customerId, customerName: findCustomerName(customerId), done: false, ...prefill }});
  }
  function openCreate() { if (tab === "invoices") newInvoice(); else if (tab === "clients") newCustomer(); else if (tab === "agenda") newAgenda(); else newQuote(); }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ target: "quote" | "invoice" | "customer"; data: Record<string, unknown> }>).detail;
      if (!detail) return;
      if (detail.target === "customer") {
        const data = detail.data as Record<string, string>;
        newCustomer({ kind: data.kind === "individual" ? "Particulier" : "Professionnel", companyName: data.company_name || "", civility: data.civility || "M.", lastName: data.last_name || "", firstName: data.first_name || "", siret: data.siret || "", vat: data.vat_number || "", emails: [data.email1 || "", data.email2 || ""], phones: [data.phone1 || "", data.phone2 || ""], address: data.line1 || "", postalCode: data.postal_code || "", city: data.city || "" });
        return;
      }
      const data = detail.data as { customer_hint?: string; title?: string; notes?: string; items?: Array<{ label?: string; description?: string; quantity?: number; unit?: string; unit_price?: number; tax_rate?: number }> };
      const matched = workspace.customers.find((customer) => customerDisplayName(customer).toLowerCase().includes((data.customer_hint || "").toLowerCase()) || (data.customer_hint || "").toLowerCase().includes(customerDisplayName(customer).toLowerCase()));
      const items = (data.items || []).map((item) => ({ id: makeId("line"), label: item.label || "Prestation", description: item.description || "", quantity: Number(item.quantity ?? 1), unit: item.unit || "u", unitPrice: Number(item.unit_price ?? 0), taxRate: Number(item.tax_rate ?? 20) }));
      const prefill = { customerId: matched?.id || workspace.customers[0]?.id || "", customerName: matched ? customerDisplayName(matched) : data.customer_hint || "Client à sélectionner", title: data.title || "Travaux", notes: data.notes || "", items: items.length ? items : [emptyLine()] };
      if (detail.target === "invoice") newInvoice(prefill); else newQuote(prefill);
    };
    window.addEventListener("projetchapet:ai-apply", handler);
    return () => window.removeEventListener("projetchapet:ai-apply", handler);
  }, [workspace.customers, workspace.invoices, workspace.quotes]);

  function updateEditorDocument(updater: (value: MobileQuote | MobileInvoice) => MobileQuote | MobileInvoice) {
    setEditor((current) => {
      if (!current || (current.kind !== "quote" && current.kind !== "invoice")) return current;
      const value = updater(current.value);
      const totals = calculateTotals(value.items);
      return { ...current, value: { ...value, ...totals } } as Editor;
    });
  }
  function updateLine(index: number, key: keyof LineItem, raw: string) {
    updateEditorDocument((value) => ({ ...value, items: value.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: ["quantity", "unitPrice", "taxRate"].includes(key) ? Number(raw) : raw } : item) }));
  }

  async function openPreview(documentData: BusinessDocument, withoutPrices = false) {
    setPreviewBusy(true);
    try {
      const blob = await buildPdf(documentData, withoutPrices); const url = URL.createObjectURL(blob);
      setPreview((current) => { if (current) URL.revokeObjectURL(current.url); return { document: documentData, withoutPrices, blob, url }; });
    } catch (error) { notify(error instanceof Error ? error.message : "Impossible de générer le PDF."); }
    finally { setPreviewBusy(false); }
  }
  function openEmail(documentData: BusinessDocument, withoutPrices: boolean) {
    const customer = workspace.customers.find((item) => item.id === documentData.customerId);
    setEmail({ document: documentData, withoutPrices, recipient: customer?.emails.find(Boolean) || "", subject: `${isQuote(documentData) ? "Votre devis" : "Votre facture"} ${documentData.number}`, message: `Bonjour,\n\nVeuillez trouver votre ${isQuote(documentData) ? "devis" : "facture"} ${documentData.number} en pièce jointe.\n\nCordialement,\nCHAPET SAS` });
  }
  async function sendEmail() {
    if (!email || !email.recipient.trim()) { notify("Renseignez une adresse e-mail."); return; }
    setEmailBusy(true);
    try {
      const blob = await buildPdf(email.document, email.withoutPrices);
      const response = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email.recipient.trim(), subject: email.subject, html: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${email.message.replaceAll("\n", "<br>")}</div>`, attachments: [{ filename: `${email.document.number}${email.withoutPrices ? "-sans-prix" : ""}.pdf`, content: await blobToBase64(blob) }] }) });
      if (!response.ok) {
        downloadBlob(blob, `${email.document.number}${email.withoutPrices ? "-sans-prix" : ""}.pdf`);
        window.location.href = `mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(`${email.message}\n\nLe PDF vient d’être téléchargé : joignez-le à ce message.`)}`;
        notify("PDF téléchargé et application Mail ouverte.");
      } else notify(`Document envoyé à ${email.recipient}.`);
      setEmail(null);
    } catch (error) { notify(error instanceof Error ? error.message : "Envoi impossible."); }
    finally { setEmailBusy(false); }
  }

  function saveEditor() {
    if (!editor) return;
    if (editor.kind === "customer") {
      const name = customerDisplayName(editor.value); if (!name || name.includes("sans nom")) { notify("Renseignez le nom du client."); return; }
      setWorkspace((current) => upsertCustomer(current, editor.value)); setSelectedCustomerId(editor.value.id); setTab("clients"); setEditor(null); notify(editor.isNew ? "Client créé et affiché." : "Client modifié."); return;
    }
    if (editor.kind === "agenda") {
      const customerName = findCustomerName(editor.value.customerId); const saved = { ...editor.value, customerName };
      setWorkspace((current) => upsertAgenda(current, saved)); setEditor(null); setTab("agenda"); notify(editor.isNew ? "Événement ajouté à l’agenda." : "Événement modifié."); return;
    }
    const customerName = findCustomerName(editor.value.customerId);
    const validItems = editor.value.items.filter((item) => item.label.trim());
    if (!editor.value.customerId) { notify("Sélectionnez un client."); return; }
    if (!validItems.length) { notify("Ajoutez au moins une prestation."); return; }
    const totals = calculateTotals(validItems);
    if (editor.kind === "quote") {
      const saved = { ...editor.value, customerName, items: validItems, ...totals };
      setWorkspace((current) => upsertQuote(current, saved)); setSelectedQuoteId(saved.id); setSelectedInvoiceId(null); setTab("quotes"); setEditor(null); notify(editor.isNew ? "Devis créé, affiché et PDF prêt." : "Devis entièrement modifié.");
    } else {
      const saved = { ...editor.value, customerName, items: validItems, ...totals };
      setWorkspace((current) => upsertInvoice(current, saved)); setSelectedInvoiceId(saved.id); setSelectedQuoteId(null); setTab("invoices"); setEditor(null); notify(editor.isNew ? "Facture créée, affichée et PDF prêt." : "Facture entièrement modifiée.");
    }
  }

  function convertSelectedQuote() {
    if (!selectedQuote) return;
    const result = convertQuoteToInvoice(workspace, selectedQuote); setWorkspace(result.workspace); setSelectedQuoteId(null); setSelectedInvoiceId(result.invoice.id); setTab("invoices"); notify(`Facture ${result.invoice.number} créée et affichée.`);
  }
  function makeCreditNote() {
    if (!selectedInvoice) return;
    const result = createCreditNote(workspace, selectedInvoice); setWorkspace(result.workspace); setSelectedInvoiceId(result.credit.id); notify(`Avoir ${result.credit.number} créé et affiché.`);
  }

  function tabTitle() { return tab === "home" ? "Accueil" : tab === "quotes" ? "Devis" : tab === "invoices" ? "Factures" : tab === "clients" ? "Clients" : "Agenda"; }

  return (
    <div className="rm-shell">
      <div className="rm-app">
        <header className="rm-header">
          <button className="rm-header-menu" onClick={() => setDrawer("menu")} aria-label="Menu"><Menu size={24} /></button>
          <h1>{tabTitle()}</h1>
          <div className="rm-header-actions"><button onClick={() => notify("Aucune nouvelle notification.")} aria-label="Notifications"><Bell size={21} /></button><button className="rm-header-plus" onClick={openCreate} aria-label="Créer"><Plus size={23} /></button></div>
        </header>

        <main className="rm-content">
          {tab === "home" && <section className="rm-section rm-home-section"><div className="rm-scroll-area">
            <div className="rm-home-hero"><span>PILOTAGE ENTREPRISE</span><strong>{money(workspace.invoices.reduce((sum, item) => sum + Math.max(0, item.total), 0))}</strong><small>Chiffre d’affaires facturé</small><div><b>+ 11,8 %</b><span>par rapport à N-1</span></div></div>
            <div className="rm-kpi-grid">
              <button onClick={() => { switchTab("quotes"); setQuoteFilter("En attente"); }}><FileText size={20} /><strong>{workspace.quotes.filter((item) => item.status === "En attente").length}</strong><span>Devis en attente</span></button>
              <button onClick={() => { switchTab("invoices"); setInvoiceFilter("En retard"); }}><AlertTriangle size={20} /><strong>{money(workspace.invoices.filter((item) => item.status === "En retard").reduce((sum, item) => sum + item.total, 0))}</strong><span>Factures en retard</span></button>
              <button onClick={() => { switchTab("invoices"); setInvoiceFilter("Payée"); }}><CheckCircle2 size={20} /><strong>{money(workspace.invoices.reduce((sum, item) => sum + item.paidTotal, 0))}</strong><span>Encaissé</span></button>
              <button onClick={() => setUtility("Analyse N-1")}><BarChart3 size={20} /><strong>{money(workspace.invoices.reduce((sum, item) => sum + item.total, 0))}</strong><span>CA annuel</span></button>
            </div>
            <div className="rm-home-panel"><div className="rm-panel-title"><div><span>À TRAITER</span><strong>Priorités du jour</strong></div><small>Actions</small></div>
              <button onClick={() => { switchTab("invoices"); setInvoiceFilter("En retard"); }}><span className="rm-task-icon danger"><AlertTriangle size={18} /></span><div><strong>Factures en retard</strong><small>Ouvrir le suivi des encaissements</small></div><ChevronRight size={18} /></button>
              <button onClick={() => { switchTab("quotes"); setQuoteFilter("En attente"); }}><span className="rm-task-icon"><Clock3 size={18} /></span><div><strong>Devis à relancer</strong><small>Voir les devis en attente</small></div><ChevronRight size={18} /></button>
              <button onClick={() => setDrawer("accounting")}><span className="rm-task-icon success"><Mail size={18} /></span><div><strong>Copie comptable</strong><small>Paramètres d’envoi automatique</small></div><ChevronRight size={18} /></button>
            </div>
          </div></section>}

          {tab === "quotes" && <section className="rm-section"><div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un devis" /></div><div className="rm-segmented">{(["Tous", "En attente", "Validé", "Terminé"] as const).map((item) => <button key={item} className={quoteFilter === item ? "active" : ""} onClick={() => setQuoteFilter(item)}>{item}</button>)}</div><div className="rm-scroll-area rm-list-scroll"><section className="rm-list">{filteredQuotes.map((quote) => <button className="rm-document-card" key={quote.id} onClick={() => setSelectedQuoteId(quote.id)}><div className="rm-document-main"><strong>{quote.customerName}</strong><small>{quote.number}</small><StatusPill status={quote.status} /></div><div className="rm-document-side"><strong>{money(quote.total)}</strong><small>Exp. {dateFr(quote.expiryDate)}</small><ChevronRight size={18} /></div></button>)}</section></div></section>}

          {tab === "invoices" && <section className="rm-section"><div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une facture" /></div><div className="rm-segmented rm-four">{(["Toutes", "Brouillon", "En cours", "Payée"] as const).map((item) => <button key={item} className={invoiceFilter === item ? "active" : ""} onClick={() => setInvoiceFilter(item)}>{item}</button>)}</div><div className="rm-scroll-area rm-list-scroll"><section className="rm-list">{filteredInvoices.map((invoice) => <button className="rm-document-card" key={invoice.id} onClick={() => setSelectedInvoiceId(invoice.id)}><div className="rm-document-main"><strong>{invoice.customerName}</strong><small>{invoice.number}</small><StatusPill status={invoice.status} /></div><div className="rm-document-side"><strong>{money(invoice.total)}</strong><small>Éch. {dateFr(invoice.dueDate)}</small><ChevronRight size={18} /></div></button>)}</section></div></section>}

          {tab === "clients" && <section className="rm-section"><div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client" /></div><div className="rm-client-count"><span>{filteredCustomers.length} clients</span><small>Pros et particuliers</small></div><div className="rm-scroll-area rm-list-scroll"><section className="rm-list rm-client-list">{filteredCustomers.map((customer) => <button className="rm-client-card" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)}><span className="rm-client-avatar"><CircleUserRound size={24} /></span><div><strong>{customerDisplayName(customer)}</strong><small>{customer.kind} · {customer.city}</small><span>{customer.phones[0] || "Téléphone à compléter"}</span></div><ChevronRight size={19} /></button>)}</section></div></section>}

          {tab === "agenda" && <section className="rm-section"><div className="rm-agenda-summary"><button className={agendaFilter === "today" ? "active" : ""} onClick={() => setAgendaFilter("today")}>Aujourd’hui <strong>{filterAgenda(workspace.agenda, "today").length}</strong></button><button className={agendaFilter === "week" ? "active" : ""} onClick={() => setAgendaFilter("week")}>Cette semaine <strong>{filterAgenda(workspace.agenda, "week").length}</strong></button><button className={agendaFilter === "invoice" ? "active" : ""} onClick={() => setAgendaFilter("invoice")}>À facturer <strong>{filterAgenda(workspace.agenda, "invoice").length}</strong></button></div><div className="rm-scroll-area rm-list-scroll"><div className="rm-agenda-list">{filteredAgenda.map((entry) => <div key={entry.id}><h2>{dateFr(entry.date)}</h2><button onClick={() => setEditor({ kind: "agenda", value: entry, isNew: false })}><span className={`rm-agenda-type rm-agenda-${entry.type.toLowerCase()}`}>{entry.type}</span><div><strong>{entry.time} · {entry.title}</strong><small>{entry.customerName}{entry.done ? " · Terminé" : ""}</small></div><ChevronRight size={18} /></button></div>)}</div></div></section>}
        </main>

        <div className="rm-create-dock"><button className="rm-create-main" onClick={openCreate}><Plus size={20} /><span>Créer</span></button><button className="rm-create-ai" onClick={() => window.dispatchEvent(new CustomEvent("projetchapet:open-ai", { detail: { target: tab === "invoices" ? "invoice" : tab === "clients" ? "customer" : "quote" } }))} aria-label="Créer avec le micro IA"><Mic size={24} /><small>IA</small></button></div>
        <nav className="rm-bottom-nav"><button className={tab === "home" ? "active" : ""} onClick={() => switchTab("home")}><Home size={24} /><span>Accueil</span></button><button className={tab === "quotes" ? "active" : ""} onClick={() => switchTab("quotes")}><FileText size={24} /><span>Devis</span></button><button className={tab === "invoices" ? "active" : ""} onClick={() => switchTab("invoices")}><ReceiptText size={24} /><span>Factures</span></button><button className={tab === "clients" ? "active" : ""} onClick={() => switchTab("clients")}><UsersRound size={24} /><span>Clients</span></button><button className={tab === "agenda" ? "active" : ""} onClick={() => switchTab("agenda")}><CalendarDays size={24} /><span>Agenda</span></button></nav>
      </div>

      {drawer && <div className="rm-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="rm-side-drawer"><header><button onClick={() => setDrawer(null)}><X size={21} /></button><div><small>PROJET CHAPET</small><strong>{drawer === "menu" ? "Menu" : drawer === "collaborators" ? "Collaborateurs" : drawer === "company" ? "Mon entreprise" : drawer === "accounting" ? "Comptabilité" : "Paramètres"}</strong></div></header>
        {drawer === "menu" && <div className="rm-drawer-list"><button onClick={() => setDrawer("collaborators")}><span><Wrench size={21} /></span><div><strong>Interface collaborateurs</strong><small>Consignes, photos et documents sans prix</small></div><ChevronRight size={19} /></button><button onClick={() => setDrawer("company")}><span><Building2 size={21} /></span><div><strong>Mon entreprise</strong><small>SIRET, TVA, banque et exercice comptable</small></div><ChevronRight size={19} /></button><button onClick={() => setDrawer("accounting")}><span><Mail size={21} /></span><div><strong>Comptable & facturation</strong><small>Envoi automatique et facturation électronique</small></div><ChevronRight size={19} /></button><button onClick={() => setDrawer("settings")}><span><Settings size={21} /></span><div><strong>Personnalisation</strong><small>Logo, couleurs, numérotation et e-mails</small></div><ChevronRight size={19} /></button></div>}
        {drawer === "collaborators" && <div className="rm-drawer-content"><div className="rm-info-hero"><Wrench size={25} /><h2>Mode chantier</h2><p>Les exécutants voient les consignes et documents sans prix.</p></div><button className="rm-work-card" onClick={() => notify("Chantier SCI Bellevue ouvert.")}><div><small>CHANTIER EN COURS</small><strong>SCI Bellevue · Hall d’entrée</strong><span>Peinture murs et plafond</span></div><ChevronRight size={20} /></button><div className="rm-action-grid"><button onClick={() => notify("Sélecteur de photos ouvert.")}><Camera size={18} /> Ajouter des photos</button><button onClick={() => notify("Signalement enregistré.")}><AlertTriangle size={18} /> Signaler un problème</button><button onClick={() => notify("Étape marquée terminée.")}><Check size={18} /> Étape terminée</button><button onClick={() => { const quote = workspace.quotes[0]; if (quote) void openPreview(quote, true); }}><FileDown size={18} /> Document sans prix</button></div></div>}
        {drawer === "company" && <div className="rm-drawer-content rm-settings-cards"><div><span>Raison sociale</span><strong>CHAPET Père & Fils</strong></div><div><span>SIRET</span><strong>879 214 563 00012</strong></div><div><span>Exercice comptable</span><strong>01 janvier → 31 décembre</strong></div><button onClick={() => setUtility("Modifier mon entreprise")}><Pencil size={18} /> Modifier les informations</button></div>}
        {drawer === "accounting" && <div className="rm-drawer-content rm-settings-cards"><div><span>Copie automatique au comptable</span><strong>compta@saschapet.com</strong><b>Activée</b></div><div><span>Facturation électronique</span><strong>Module en préparation</strong></div><button onClick={() => notify("Test d’envoi comptable réussi.")}><Send size={18} /> Tester l’envoi comptable</button></div>}
        {drawer === "settings" && <div className="rm-drawer-content rm-settings-cards"><div><span>Logo</span><strong>Logo CHAPET</strong></div><div><span>Couleur</span><strong>Bleu professionnel</strong><Palette size={19} /></div><div><span>Validité des devis</span><strong>2 mois</strong></div><button onClick={() => setUtility("Personnalisation complète")}><Settings size={18} /> Ouvrir tous les paramètres</button></div>}
      </aside></div>}

      {editor && <div className="rm-modal-backdrop"><section className="rm-create-sheet rm-v2-editor"><header><button onClick={() => setEditor(null)}><X size={20} /></button><h2>{editor.isNew ? "Créer" : "Modifier"} {editor.kind === "quote" ? "le devis" : editor.kind === "invoice" ? "la facture" : editor.kind === "customer" ? "le client" : "l’événement"}</h2><span /></header>
        {(editor.kind === "quote" || editor.kind === "invoice") && <>
          <div className="rm-form-stack">
            <label>Client<select value={editor.value.customerId} onChange={(event) => updateEditorDocument((value) => ({ ...value, customerId: event.target.value, customerName: findCustomerName(event.target.value) }))}>{workspace.customers.map((customer) => <option key={customer.id} value={customer.id}>{customerDisplayName(customer)}</option>)}</select></label>
            <div className="rm-v2-two"><label>Numéro<input value={editor.value.number} onChange={(event) => updateEditorDocument((value) => ({ ...value, number: event.target.value }))} /></label><label>Statut<select value={editor.value.status} onChange={(event) => updateEditorDocument((value) => ({ ...value, status: event.target.value as never }))}>{(editor.kind === "quote" ? ["En attente", "Validé", "Terminé", "Refusé"] : ["Brouillon", "En cours", "Payée", "En retard", "Avoir"]).map((status) => <option key={status}>{status}</option>)}</select></label></div>
            <label>Objet / chantier<input value={editor.value.title} onChange={(event) => updateEditorDocument((value) => ({ ...value, title: event.target.value }))} /></label>
            <div className="rm-v2-two"><label>Date d’émission<input type="date" value={editor.value.issueDate} onChange={(event) => updateEditorDocument((value) => ({ ...value, issueDate: event.target.value }))} /></label>{editor.kind === "quote" ? <label>Date d’expiration<input type="date" value={editor.value.expiryDate} onChange={(event) => updateEditorDocument((value) => ({ ...value, expiryDate: event.target.value }))} /></label> : <label>Date d’échéance<input type="date" value={editor.value.dueDate} onChange={(event) => updateEditorDocument((value) => ({ ...value, dueDate: event.target.value }))} /></label>}</div>
            <label>Notes<textarea value={editor.value.notes} onChange={(event) => updateEditorDocument((value) => ({ ...value, notes: event.target.value }))} /></label>
          </div>
          <div className="rm-products-title"><span>Produits et services</span><button onClick={() => updateEditorDocument((value) => ({ ...value, items: [...value.items, emptyLine()] }))}><Plus size={21} /></button></div>
          <div className="rm-v2-lines">{editor.value.items.map((item, index) => <article key={item.id}><header><strong>Ligne {index + 1}</strong><button onClick={() => updateEditorDocument((value) => ({ ...value, items: value.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={17} /></button></header><input placeholder="Désignation" value={item.label} onChange={(event) => updateLine(index, "label", event.target.value)} /><textarea placeholder="Description" value={item.description} onChange={(event) => updateLine(index, "description", event.target.value)} /><div className="rm-v2-line-grid"><label>Quantité<input type="number" step="0.01" value={item.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label><label>Unité<input value={item.unit} onChange={(event) => updateLine(index, "unit", event.target.value)} /></label><label>Prix HT<input type="number" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} /></label><label>TVA %<input type="number" step="0.1" value={item.taxRate} onChange={(event) => updateLine(index, "taxRate", event.target.value)} /></label></div><div className="rm-v2-line-total"><span>Total HT</span><strong>{money(item.quantity * item.unitPrice)}</strong></div></article>)}</div>
          <div className="rm-ai-create-row"><button className="rm-ai-create-text" onClick={() => window.dispatchEvent(new CustomEvent("projetchapet:open-ai", { detail: { target: editor.kind } }))}><span>Créer avec l’IA</span><small>Dicter et préremplir toutes les lignes</small></button><button className="rm-voice-button" onClick={() => window.dispatchEvent(new CustomEvent("projetchapet:open-ai", { detail: { target: editor.kind } }))}><Mic size={25} /><small>IA</small></button></div>
          <footer><div><small>Total HT</small><strong>{money(editor.value.subtotal)}</strong><small>TVA : {money(editor.value.taxTotal)} · TTC : {money(editor.value.total)}</small></div><div><button className="rm-outline-button" onClick={() => void openPreview(editor.value, false)} disabled={previewBusy}>{previewBusy ? "Génération…" : "Aperçu PDF"}</button><button className="rm-save-button" onClick={saveEditor}>Enregistrer</button></div></footer>
        </>}
        {editor.kind === "customer" && <><div className="rm-form-stack"><div className="rm-kind-switch"><button className={editor.value.kind === "Professionnel" ? "active" : ""} onClick={() => setEditor({ ...editor, value: { ...editor.value, kind: "Professionnel" } })}>Professionnel</button><button className={editor.value.kind === "Particulier" ? "active" : ""} onClick={() => setEditor({ ...editor, value: { ...editor.value, kind: "Particulier" } })}>Particulier</button></div>{editor.value.kind === "Professionnel" ? <label>Raison sociale<input value={editor.value.companyName} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, companyName: event.target.value } })} /></label> : <><div className="rm-v2-three"><label>Civilité<input value={editor.value.civility} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, civility: event.target.value } })} /></label><label>Nom<input value={editor.value.lastName} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, lastName: event.target.value } })} /></label><label>Prénom<input value={editor.value.firstName} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, firstName: event.target.value } })} /></label></div></>}<div className="rm-v2-two"><label>E-mail principal<input type="email" value={editor.value.emails[0] || ""} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, emails: [event.target.value, editor.value.emails[1] || ""] } })} /></label><label>Second e-mail<input type="email" value={editor.value.emails[1] || ""} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, emails: [editor.value.emails[0] || "", event.target.value] } })} /></label></div><div className="rm-v2-two"><label>Téléphone<input value={editor.value.phones[0] || ""} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, phones: [event.target.value, editor.value.phones[1] || ""] } })} /></label><label>Second téléphone<input value={editor.value.phones[1] || ""} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, phones: [editor.value.phones[0] || "", event.target.value] } })} /></label></div><label>Adresse<input value={editor.value.address} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, address: event.target.value } })} /></label><div className="rm-v2-two"><label>Code postal<input value={editor.value.postalCode} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, postalCode: event.target.value } })} /></label><label>Ville<input value={editor.value.city} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, city: event.target.value } })} /></label></div>{editor.value.kind === "Professionnel" && <div className="rm-v2-two"><label>SIRET<input value={editor.value.siret} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, siret: event.target.value } })} /></label><label>TVA<input value={editor.value.vat} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, vat: event.target.value } })} /></label></div>}<label>Notes<textarea value={editor.value.notes} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, notes: event.target.value } })} /></label></div><footer><div><small>État</small><strong>Fiche complète</strong></div><div><button className="rm-outline-button" onClick={() => setEditor(null)}>Annuler</button><button className="rm-save-button" onClick={saveEditor}>Enregistrer</button></div></footer></>}
        {editor.kind === "agenda" && <><div className="rm-form-stack"><label>Type<select value={editor.value.type} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, type: event.target.value as AgendaType } })}>{["Chantier", "Commande", "Facturation", "Relance"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Client<select value={editor.value.customerId} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, customerId: event.target.value, customerName: findCustomerName(event.target.value) } })}>{workspace.customers.map((customer) => <option key={customer.id} value={customer.id}>{customerDisplayName(customer)}</option>)}</select></label><div className="rm-v2-two"><label>Date<input type="date" value={editor.value.date} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, date: event.target.value } })} /></label><label>Heure<input type="time" value={editor.value.time} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, time: event.target.value } })} /></label></div><label>Consigne<textarea value={editor.value.title} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} /></label><label className="rm-v2-check"><input type="checkbox" checked={editor.value.done} onChange={(event) => setEditor({ ...editor, value: { ...editor.value, done: event.target.checked } })} /> Tâche terminée</label></div><footer><div><small>État</small><strong>{editor.value.done ? "Terminé" : "À planifier"}</strong></div><div><button className="rm-outline-button" onClick={() => setEditor(null)}>Annuler</button><button className="rm-save-button" onClick={saveEditor}>Enregistrer</button></div></footer></>}
      </section></div>}

      {selectedQuote && <div className="rm-modal-backdrop"><section className="rm-detail-sheet"><header><button onClick={() => setSelectedQuoteId(null)}><ArrowLeft size={20} /></button><div><small>DEVIS</small><h2>{selectedQuote.number}</h2></div><button onClick={() => setEditor({ kind: "quote", value: { ...selectedQuote, items: cloneLines(selectedQuote.items) }, isNew: false })}><Pencil size={19} /></button></header><button className="rm-detail-client" onClick={() => setSelectedCustomerId(selectedQuote.customerId)}><span><CircleUserRound size={23} /></span><div><small>Client</small><strong>{selectedQuote.customerName}</strong></div><ChevronRight size={19} /></button><div className="rm-detail-amount"><small>Montant TTC</small><strong>{money(selectedQuote.total)}</strong><span>{selectedQuote.title}</span></div><div className="rm-detail-dates"><div><span>Émis le</span><strong>{dateFr(selectedQuote.issueDate)}</strong></div><div><span>Validité</span><strong>{dateFr(selectedQuote.expiryDate)}</strong></div></div><div className="rm-status-editor"><span>État du devis</span><div>{(["En attente", "Validé", "Terminé", "Refusé"] as QuoteStatus[]).map((status) => <button key={status} className={selectedQuote.status === status ? "active" : ""} onClick={() => setWorkspace((current) => upsertQuote(current, { ...selectedQuote, status }))}>{status}</button>)}</div></div><div className="rm-detail-actions"><button onClick={() => void openPreview(selectedQuote, false)}><FileDown size={18} /> Aperçu PDF</button><button onClick={() => setPdfChoice({ document: selectedQuote, mode: "email" })}><Mail size={18} /> Envoyer PDF</button><button onClick={convertSelectedQuote}><RefreshCw size={18} /> Transformer en facture</button><button onClick={() => setEditor({ kind: "quote", value: { ...selectedQuote, items: cloneLines(selectedQuote.items) }, isNew: false })}><Pencil size={18} /> Tout modifier</button><button onClick={() => newQuote({ ...selectedQuote, id: makeId("quote"), number: nextNumber(workspace.quotes, "D"), status: "En attente", items: cloneLines(selectedQuote.items) })}><Plus size={18} /> Dupliquer</button><button className="danger" onClick={() => { if (window.confirm(`Supprimer ${selectedQuote.number} ?`)) { setWorkspace((current) => deleteQuoteFromWorkspace(current, selectedQuote.id)); setSelectedQuoteId(null); notify("Devis supprimé."); } }}><Trash2 size={18} /> Supprimer</button></div></section></div>}

      {selectedInvoice && <div className="rm-modal-backdrop"><section className="rm-detail-sheet"><header><button onClick={() => setSelectedInvoiceId(null)}><ArrowLeft size={20} /></button><div><small>FACTURE</small><h2>{selectedInvoice.number}</h2></div><button onClick={() => setEditor({ kind: "invoice", value: { ...selectedInvoice, items: cloneLines(selectedInvoice.items) }, isNew: false })}><Pencil size={19} /></button></header><button className="rm-detail-client" onClick={() => setSelectedCustomerId(selectedInvoice.customerId)}><span><CircleUserRound size={23} /></span><div><small>Client</small><strong>{selectedInvoice.customerName}</strong></div><ChevronRight size={19} /></button><div className="rm-detail-amount"><small>Montant TTC</small><strong>{money(selectedInvoice.total)}</strong><StatusPill status={selectedInvoice.status} /></div><div className="rm-detail-dates"><div><span>Émise le</span><strong>{dateFr(selectedInvoice.issueDate)}</strong></div><div><span>Échéance</span><strong>{dateFr(selectedInvoice.dueDate)}</strong></div></div><div className="rm-accountant-state"><Mail size={19} /><div><strong>{selectedInvoice.accountantSent ? "Envoyée au comptable" : "Pas encore envoyée"}</strong><small>Copie automatique configurable</small></div></div><div className="rm-detail-actions"><button onClick={() => setWorkspace((current) => upsertInvoice(current, { ...selectedInvoice, status: "Payée", paidTotal: selectedInvoice.total }))}><CheckCircle2 size={18} /> Marquer payée</button><button onClick={() => void openPreview(selectedInvoice, false)}><FileDown size={18} /> Aperçu PDF</button><button onClick={() => setPdfChoice({ document: selectedInvoice, mode: "email" })}><Mail size={18} /> Envoyer PDF</button><button onClick={() => openEmail(selectedInvoice, false)}><Send size={18} /> Envoyer comptable</button><button onClick={() => setEditor({ kind: "invoice", value: { ...selectedInvoice, items: cloneLines(selectedInvoice.items) }, isNew: false })}><Pencil size={18} /> Tout modifier</button><button onClick={makeCreditNote}><RefreshCw size={18} /> Créer un avoir</button>{selectedInvoice.status === "Brouillon" && <button className="danger" onClick={() => { if (window.confirm(`Supprimer ${selectedInvoice.number} ?`)) { setWorkspace((current) => deleteInvoiceFromWorkspace(current, selectedInvoice.id)); setSelectedInvoiceId(null); notify("Brouillon supprimé."); } }}><Trash2 size={18} /> Supprimer</button>}</div></section></div>}

      {selectedCustomer && <div className="rm-modal-backdrop"><section className="rm-detail-sheet"><header><button onClick={() => setSelectedCustomerId(null)}><ArrowLeft size={20} /></button><div><small>CLIENT</small><h2>{customerDisplayName(selectedCustomer)}</h2></div><button onClick={() => setEditor({ kind: "customer", value: { ...selectedCustomer, emails: [...selectedCustomer.emails], phones: [...selectedCustomer.phones] }, isNew: false })}><Pencil size={19} /></button></header><div className="rm-client-detail-head"><span><CircleUserRound size={30} /></span><div><strong>{selectedCustomer.kind}</strong><small>{selectedCustomer.city}</small></div></div><div className="rm-client-fields"><div><span>Téléphones</span><strong>{selectedCustomer.phones.filter(Boolean).join(" · ") || "—"}</strong></div><div><span>E-mails</span><strong>{selectedCustomer.emails.filter(Boolean).join(" · ") || "—"}</strong></div><div><span>Adresse</span><strong>{[selectedCustomer.address, selectedCustomer.postalCode, selectedCustomer.city].filter(Boolean).join(", ")}</strong></div>{selectedCustomer.siret && <div><span>SIRET</span><strong>{selectedCustomer.siret}</strong><small>{selectedCustomer.vat}</small></div>}</div><div className="rm-detail-actions"><button onClick={() => { setSelectedCustomerId(null); switchTab("quotes"); setQuery(customerDisplayName(selectedCustomer)); }}><FileText size={18} /> Voir les devis</button><button onClick={() => { setSelectedCustomerId(null); switchTab("invoices"); setQuery(customerDisplayName(selectedCustomer)); }}><ReceiptText size={18} /> Voir les factures</button><button onClick={() => setEditor({ kind: "customer", value: { ...selectedCustomer, emails: [...selectedCustomer.emails], phones: [...selectedCustomer.phones] }, isNew: false })}><Pencil size={18} /> Modifier</button><button onClick={() => { setSelectedCustomerId(null); newQuote({ customerId: selectedCustomer.id, customerName: customerDisplayName(selectedCustomer) }); }}><Plus size={18} /> Nouveau devis</button></div></section></div>}

      {pdfChoice && <div className="rm-modal-backdrop"><section className="rm-v2-choice"><header><button onClick={() => setPdfChoice(null)}><X size={20} /></button><div><small>FORMAT DU PDF</small><h2>Avec ou sans prix ?</h2></div><span /></header><p>Choisissez la version à envoyer au client ou au collaborateur.</p><button onClick={() => { const choice = pdfChoice; setPdfChoice(null); choice.mode === "email" ? openEmail(choice.document, false) : void openPreview(choice.document, false); }}><ReceiptText size={22} /><div><strong>PDF avec prix</strong><small>Montants HT, TVA et TTC visibles</small></div><ChevronRight size={18} /></button><button onClick={() => { const choice = pdfChoice; setPdfChoice(null); choice.mode === "email" ? openEmail(choice.document, true) : void openPreview(choice.document, true); }}><FileText size={22} /><div><strong>PDF sans prix</strong><small>Version collaborateurs / chantier</small></div><ChevronRight size={18} /></button></section></div>}

      {preview && <div className="rm-modal-backdrop rm-v2-pdf-backdrop"><section className="rm-v2-pdf"><header><div><small>{preview.withoutPrices ? "SANS PRIX" : "PDF COMPLET"}</small><h2>{preview.document.number}</h2></div><button onClick={() => setPreview((current) => { if (current) URL.revokeObjectURL(current.url); return null; })}><X size={20} /></button></header><iframe src={preview.url} title={`Aperçu ${preview.document.number}`} /><footer><button onClick={() => downloadBlob(preview.blob, `${preview.document.number}${preview.withoutPrices ? "-sans-prix" : ""}.pdf`)}><Download size={18} /> Télécharger</button><button onClick={async () => { const file = new File([preview.blob], `${preview.document.number}.pdf`, { type: "application/pdf" }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ files: [file], title: preview.document.number }); else downloadBlob(preview.blob, `${preview.document.number}.pdf`); }}><Share2 size={18} /> Partager</button><button onClick={() => { const current = preview; setPreview(null); openEmail(current.document, current.withoutPrices); }}><Mail size={18} /> Envoyer</button></footer></section></div>}

      {email && <div className="rm-modal-backdrop"><section className="rm-create-sheet rm-v2-email"><header><button onClick={() => setEmail(null)}><X size={20} /></button><h2>Envoyer le PDF</h2><span /></header><div className="rm-form-stack"><label>Version<input value={email.withoutPrices ? "PDF sans prix" : "PDF avec prix"} readOnly /></label><label>Destinataire<input type="email" value={email.recipient} onChange={(event) => setEmail({ ...email, recipient: event.target.value })} /></label><label>Objet<input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} /></label><label>Message<textarea value={email.message} onChange={(event) => setEmail({ ...email, message: event.target.value })} /></label></div><footer><div><small>Pièce jointe</small><strong>{email.document.number}.pdf</strong></div><div><button className="rm-outline-button" onClick={() => setEmail(null)}>Annuler</button><button className="rm-save-button" onClick={() => void sendEmail()} disabled={emailBusy}>{emailBusy ? <Loader2 size={18} className="mai-spin" /> : "Envoyer"}</button></div></footer></section></div>}

      {utility && <div className="rm-modal-backdrop"><section className="rm-v2-choice"><header><button onClick={() => setUtility(null)}><X size={20} /></button><div><small>PARAMÈTRES</small><h2>{utility}</h2></div><span /></header><p>Cette section du prototype est interactive et conserve les fonctions déjà présentées.</p><button onClick={() => notify("Paramètre enregistré.")}><Check size={22} /><div><strong>Enregistrer les réglages</strong><small>Simulation fonctionnelle du prototype</small></div><ChevronRight size={18} /></button><button onClick={() => { setUtility(null); setDrawer("settings"); }}><Settings size={22} /><div><strong>Retour aux paramètres</strong><small>Logo, couleurs et e-mails</small></div><ChevronRight size={18} /></button></section></div>}

      {previewBusy && !preview && <div className="rm-v2-global-loader"><Loader2 size={28} className="mai-spin" /><span>Génération du PDF…</span></div>}
      {toast && <div className="rm-toast"><Check size={18} />{toast}</div>}
    </div>
  );
}
