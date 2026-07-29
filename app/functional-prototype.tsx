"use client";

import {
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Loader2,
  Mail,
  Menu,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateTotals,
  customerName,
  deleteCustomer,
  deleteInvoice,
  deleteQuote,
  fetchWorkspace,
  markInvoicePaid,
  saveCustomer,
  saveInvoice,
  saveQuote,
  updateInvoiceStatus,
  updateQuoteStatus,
  type Customer,
  type CustomerInput,
  type DocumentInput,
  type DocumentItem,
  type Invoice,
  type InvoiceStatus,
  type Quote,
  type QuoteStatus,
} from "@/lib/project-chapet";

type Section = "dashboard" | "quotes" | "invoices" | "clients" | "calendar" | "settings";
type ModalState =
  | { kind: "client"; value?: Customer }
  | { kind: "quote"; value?: Quote }
  | { kind: "invoice"; value?: Invoice; fromQuote?: Quote }
  | { kind: "client-details"; value: Customer }
  | { kind: "quote-details"; value: Quote }
  | { kind: "invoice-details"; value: Invoice }
  | null;

const navItems = [
  { id: "dashboard" as Section, label: "Tableau de bord", icon: LayoutDashboard },
  { id: "quotes" as Section, label: "Devis", icon: FileText },
  { id: "invoices" as Section, label: "Factures", icon: ReceiptText },
  { id: "clients" as Section, label: "Clients", icon: UsersRound },
  { id: "calendar" as Section, label: "Agenda", icon: CalendarDays },
  { id: "settings" as Section, label: "Paramètres", icon: Settings },
];

const quoteLabels: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  cancelled: "Annulé",
};

const invoiceLabels: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  sent: "Envoyée",
  partially_paid: "Partiellement payée",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
};

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerEuro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function Status({ value, type }: { value: QuoteStatus | InvoiceStatus; type: "quote" | "invoice" }) {
  const label = type === "quote" ? quoteLabels[value as QuoteStatus] : invoiceLabels[value as InvoiceStatus];
  const slug = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-");
  return <span className={`pc-status pc-status-${slug}`}>{label}</span>;
}

function Kpi({ label, value, note, icon: Icon, strong = false }: { label: string; value: string; note: string; icon: typeof LayoutDashboard; strong?: boolean }) {
  return (
    <article className={`pc-kpi ${strong ? "pc-kpi-strong" : ""}`}>
      <div className="pc-kpi-icon"><Icon size={18} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function LoadingState() {
  return <div className="pc-loading"><Loader2 size={28} className="pc-spin" /><strong>Chargement de l’espace de travail…</strong></div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="pc-empty"><FileText size={28} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="pc-drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`pc-crud-modal ${wide ? "pc-crud-modal-wide" : ""}`}>
        <header><div><span>Projet Chapet</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="pc-icon-button" onClick={onClose} aria-label="Fermer"><X size={19} /></button></header>
        {children}
      </section>
    </div>
  );
}

function ClientForm({ customer, onClose, onSaved, setToast }: { customer?: Customer; onClose: () => void; onSaved: () => Promise<void>; setToast: (message: string) => void }) {
  const address = customer?.addresses?.[0] ?? {};
  const [form, setForm] = useState({
    kind: customer?.kind ?? "business",
    company_name: customer?.company_name ?? "",
    civility: customer?.civility ?? "M.",
    last_name: customer?.last_name ?? "",
    first_name: customer?.first_name ?? "",
    siret: customer?.siret ?? "",
    vat_number: customer?.vat_number ?? "",
    email1: customer?.emails?.[0] ?? "",
    email2: customer?.emails?.[1] ?? "",
    phone1: customer?.phones?.[0] ?? "",
    phone2: customer?.phones?.[1] ?? "",
    line1: address.line1 ?? "",
    postal_code: address.postal_code ?? "",
    city: address.city ?? "",
    notes: customer?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.kind === "business" && !form.company_name.trim()) return setToast("La raison sociale est obligatoire.");
    if (form.kind === "individual" && !form.last_name.trim()) return setToast("Le nom du particulier est obligatoire.");
    setSaving(true);
    try {
      const input: CustomerInput = {
        kind: form.kind as CustomerInput["kind"],
        company_name: form.kind === "business" ? form.company_name.trim() : null,
        civility: form.kind === "individual" ? form.civility : null,
        last_name: form.kind === "individual" ? form.last_name.trim() : null,
        first_name: form.kind === "individual" ? form.first_name.trim() : null,
        siret: form.kind === "business" ? form.siret.trim() || null : null,
        vat_number: form.kind === "business" ? form.vat_number.trim() || null : null,
        emails: [form.email1.trim(), form.email2.trim()].filter(Boolean),
        phones: [form.phone1.trim(), form.phone2.trim()].filter(Boolean),
        addresses: [{ label: "Principale", line1: form.line1.trim(), postal_code: form.postal_code.trim(), city: form.city.trim(), country: "France" }],
        notes: form.notes.trim() || null,
      };
      await saveCustomer(input, customer?.id);
      await onSaved();
      setToast(customer ? "Client modifié." : "Client créé.");
      onClose();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Impossible d’enregistrer le client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? "Modifier le client" : "Nouveau client"} subtitle="Les informations seront disponibles dans les devis et factures." onClose={onClose} wide>
      <form className="pc-crud-form" onSubmit={submit}>
        <div className="pc-segmented">
          <button type="button" className={form.kind === "business" ? "active" : ""} onClick={() => update("kind", "business")}>Professionnel</button>
          <button type="button" className={form.kind === "individual" ? "active" : ""} onClick={() => update("kind", "individual")}>Particulier</button>
        </div>
        {form.kind === "business" ? (
          <div className="pc-crud-grid">
            <label className="pc-span-2">Raison sociale<input value={form.company_name} onChange={(event) => update("company_name", event.target.value)} required /></label>
            <label>SIRET<input value={form.siret} onChange={(event) => update("siret", event.target.value)} /></label>
            <label>TVA intracommunautaire<input value={form.vat_number} onChange={(event) => update("vat_number", event.target.value)} /></label>
          </div>
        ) : (
          <div className="pc-crud-grid pc-crud-grid-three">
            <label>Civilité<select value={form.civility} onChange={(event) => update("civility", event.target.value)}><option>M.</option><option>Mme</option><option>M. et Mme</option></select></label>
            <label>Nom<input value={form.last_name} onChange={(event) => update("last_name", event.target.value)} required /></label>
            <label>Prénom<input value={form.first_name} onChange={(event) => update("first_name", event.target.value)} /></label>
          </div>
        )}
        <h3>Coordonnées</h3>
        <div className="pc-crud-grid">
          <label>E-mail principal<input type="email" value={form.email1} onChange={(event) => update("email1", event.target.value)} /></label>
          <label>Second e-mail<input type="email" value={form.email2} onChange={(event) => update("email2", event.target.value)} /></label>
          <label>Téléphone principal<input value={form.phone1} onChange={(event) => update("phone1", event.target.value)} /></label>
          <label>Second téléphone<input value={form.phone2} onChange={(event) => update("phone2", event.target.value)} /></label>
          <label className="pc-span-2">Adresse<input value={form.line1} onChange={(event) => update("line1", event.target.value)} /></label>
          <label>Code postal<input value={form.postal_code} onChange={(event) => update("postal_code", event.target.value)} /></label>
          <label>Ville<input value={form.city} onChange={(event) => update("city", event.target.value)} /></label>
          <label className="pc-span-2">Notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
        </div>
        <footer><button type="button" className="pc-secondary" onClick={onClose}>Annuler</button><button className="pc-primary" disabled={saving}>{saving && <Loader2 size={16} className="pc-spin" />}{customer ? "Enregistrer" : "Créer le client"}</button></footer>
      </form>
    </Modal>
  );
}

function blankItem(): DocumentItem {
  return { position: 0, label: "", description: null, quantity: 1, unit: "u", unit_price: 0, tax_rate: 20, total: 0 };
}

function DocumentForm({ kind, customers, quote, invoice, fromQuote, existingNumbers, onClose, onSaved, setToast }: {
  kind: "quote" | "invoice";
  customers: Customer[];
  quote?: Quote;
  invoice?: Invoice;
  fromQuote?: Quote;
  existingNumbers: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  setToast: (message: string) => void;
}) {
  const source = kind === "quote" ? quote : invoice;
  const initialItems = source?.items?.length ? source.items : fromQuote?.items?.length ? fromQuote.items : [blankItem()];
  const [customerId, setCustomerId] = useState(source?.customer_id ?? fromQuote?.customer_id ?? customers[0]?.id ?? "");
  const [title, setTitle] = useState(quote?.title ?? fromQuote?.title ?? "Travaux de rénovation");
  const [status, setStatus] = useState<QuoteStatus | InvoiceStatus>(source?.status ?? "draft");
  const [issueDate, setIssueDate] = useState(source?.issue_date ?? todayIso());
  const [limitDate, setLimitDate] = useState(kind === "quote" ? quote?.expiry_date ?? addDays(todayIso(), 60) : invoice?.due_date ?? addDays(todayIso(), 30));
  const [notes, setNotes] = useState(source?.notes ?? "");
  const [items, setItems] = useState<DocumentItem[]>(initialItems.map((item, index) => ({ ...item, position: index })));
  const [saving, setSaving] = useState(false);
  const totals = useMemo(() => calculateTotals(items), [items]);

  function updateItem(index: number, key: keyof DocumentItem, value: string | number | null) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!customerId) return setToast("Sélectionnez un client.");
    const validItems = items.filter((item) => item.label.trim() && Number(item.quantity) > 0);
    if (!validItems.length) return setToast("Ajoutez au moins une ligne complète.");
    setSaving(true);
    try {
      const input: DocumentInput = {
        customer_id: customerId,
        title,
        status,
        issue_date: issueDate,
        expiry_date: kind === "quote" ? limitDate : null,
        due_date: kind === "invoice" ? limitDate : null,
        notes: notes.trim() || null,
        items: validItems,
        quote_id: fromQuote?.id ?? invoice?.quote_id ?? null,
      };
      if (kind === "quote") await saveQuote(input, existingNumbers, quote?.id);
      else await saveInvoice(input, existingNumbers, invoice?.id);
      if (fromQuote && kind === "invoice") await updateQuoteStatus(fromQuote.id, "accepted");
      await onSaved();
      setToast(kind === "quote" ? (quote ? "Devis modifié." : "Devis créé.") : (invoice ? "Facture modifiée." : "Facture créée."));
      onClose();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Impossible d’enregistrer le document.");
    } finally {
      setSaving(false);
    }
  }

  const statuses = kind === "quote" ? Object.entries(quoteLabels) : Object.entries(invoiceLabels);

  return (
    <Modal title={kind === "quote" ? (quote ? `Modifier ${quote.number}` : "Nouveau devis") : (invoice ? `Modifier ${invoice.number}` : fromQuote ? `Facturer ${fromQuote.number}` : "Nouvelle facture")} subtitle="Les montants sont recalculés automatiquement à chaque modification." onClose={onClose} wide>
      <form className="pc-crud-form" onSubmit={submit}>
        <div className="pc-crud-grid">
          <label>Client<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required><option value="">Sélectionner…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
          <label>État<select value={status} onChange={(event) => setStatus(event.target.value as QuoteStatus | InvoiceStatus)}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {kind === "quote" && <label className="pc-span-2">Objet du devis<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>}
          <label>Date d’émission<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label>
          <label>{kind === "quote" ? "Valide jusqu’au" : "Date d’échéance"}<input type="date" value={limitDate} onChange={(event) => setLimitDate(event.target.value)} /></label>
        </div>

        <div className="pc-items-head"><div><h3>Prestations</h3><p>Quantités, unités, prix unitaires et TVA.</p></div><button type="button" className="pc-secondary" onClick={() => setItems((current) => [...current, { ...blankItem(), position: current.length }])}><Plus size={15} /> Ajouter une ligne</button></div>
        <div className="pc-items-editor">
          {items.map((item, index) => (
            <div className="pc-item-editor" key={`${item.id ?? "new"}-${index}`}>
              <label className="pc-item-label">Désignation<input value={item.label} onChange={(event) => updateItem(index, "label", event.target.value)} placeholder="Ex. Préparation des murs" /></label>
              <label>Qté<input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /></label>
              <label>Unité<input value={item.unit ?? ""} onChange={(event) => updateItem(index, "unit", event.target.value)} /></label>
              <label>Prix unitaire<input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, "unit_price", Number(event.target.value))} /></label>
              <label>TVA<select value={item.tax_rate} onChange={(event) => updateItem(index, "tax_rate", Number(event.target.value))}><option value={0}>0 %</option><option value={5.5}>5,5 %</option><option value={10}>10 %</option><option value={20}>20 %</option></select></label>
              <strong>{euro.format(Number(item.quantity || 0) * Number(item.unit_price || 0))}</strong>
              <button type="button" className="pc-icon-button pc-danger-icon" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="pc-document-bottom">
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Conditions, détails du chantier, message au client…" /></label>
          <div className="pc-totals"><span>Sous-total HT<strong>{euro.format(totals.subtotal)}</strong></span><span>TVA<strong>{euro.format(totals.tax_total)}</strong></span><span className="total">Total TTC<strong>{euro.format(totals.total)}</strong></span></div>
        </div>
        <footer><button type="button" className="pc-secondary" onClick={onClose}>Annuler</button><button className="pc-primary" disabled={saving}>{saving && <Loader2 size={16} className="pc-spin" />}{source ? "Enregistrer les modifications" : kind === "quote" ? "Créer le devis" : "Créer la facture"}</button></footer>
      </form>
    </Modal>
  );
}

function ClientDetails({ customer, quotes, invoices, onClose, onEdit, onDelete, setModal }: { customer: Customer; quotes: Quote[]; invoices: Invoice[]; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; setModal: (modal: ModalState) => void }) {
  const customerQuotes = quotes.filter((quote) => quote.customer_id === customer.id);
  const customerInvoices = invoices.filter((invoice) => invoice.customer_id === customer.id);
  return (
    <Modal title={customerName(customer)} subtitle={customer.kind === "business" ? "Client professionnel" : "Client particulier"} onClose={onClose} wide>
      <div className="pc-details-grid">
        <section><h3>Coordonnées</h3><dl><div><dt>E-mails</dt><dd>{customer.emails.join(" · ") || "—"}</dd></div><div><dt>Téléphones</dt><dd>{customer.phones.join(" · ") || "—"}</dd></div><div><dt>Adresse</dt><dd>{[customer.addresses?.[0]?.line1, customer.addresses?.[0]?.postal_code, customer.addresses?.[0]?.city].filter(Boolean).join(" · ") || "—"}</dd></div>{customer.kind === "business" && <><div><dt>SIRET</dt><dd>{customer.siret || "—"}</dd></div><div><dt>TVA</dt><dd>{customer.vat_number || "—"}</dd></div></>}</dl></section>
        <section><h3>Historique</h3><div className="pc-details-kpis"><div><span>Devis</span><strong>{customerQuotes.length}</strong></div><div><span>Factures</span><strong>{customerInvoices.length}</strong></div><div><span>Facturé</span><strong>{integerEuro.format(customerInvoices.reduce((sum, item) => sum + Number(item.total), 0))}</strong></div></div></section>
      </div>
      <div className="pc-linked-docs"><h3>Documents récents</h3>{customerQuotes.slice(0, 3).map((quote) => <button key={quote.id} onClick={() => setModal({ kind: "quote-details", value: quote })}><FileText size={16} /><span><strong>{quote.number}</strong><small>{quote.title}</small></span><Status type="quote" value={quote.status} /></button>)}{customerInvoices.slice(0, 3).map((invoice) => <button key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><ReceiptText size={16} /><span><strong>{invoice.number}</strong><small>{formatDate(invoice.issue_date)}</small></span><Status type="invoice" value={invoice.status} /></button>)}</div>
      <footer className="pc-details-footer"><button className="pc-danger-button" onClick={onDelete}><Trash2 size={16} /> Supprimer</button><div><button className="pc-secondary" onClick={onEdit}><Pencil size={16} /> Modifier</button><button className="pc-primary" onClick={() => setModal({ kind: "quote" })}><Plus size={16} /> Nouveau devis</button></div></footer>
    </Modal>
  );
}

function QuoteDetails({ quote, onClose, onEdit, onDelete, onChanged, setModal, setToast }: { quote: Quote; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; onChanged: () => Promise<void>; setModal: (modal: ModalState) => void; setToast: (message: string) => void }) {
  const totals = calculateTotals(quote.items);
  async function changeStatus(status: QuoteStatus) {
    try { await updateQuoteStatus(quote.id, status); await onChanged(); setToast(`Devis marqué « ${quoteLabels[status]} ».`); onClose(); } catch (error) { setToast(error instanceof Error ? error.message : "Échec de la mise à jour."); }
  }
  return (
    <Modal title={quote.number} subtitle={`${customerName(quote.customer)} · ${quote.title}`} onClose={onClose} wide>
      <div className="pc-document-summary"><div><span>Émis le</span><strong>{formatDate(quote.issue_date)}</strong></div><div><span>Valide jusqu’au</span><strong>{formatDate(quote.expiry_date)}</strong></div><div><span>État</span><Status type="quote" value={quote.status} /></div><div><span>Total TTC</span><strong>{euro.format(Number(quote.total))}</strong></div></div>
      <div className="pc-document-lines"><div className="head"><span>Désignation</span><span>Qté</span><span>PU HT</span><span>TVA</span><span>Total HT</span></div>{quote.items.map((item) => <div key={item.id}><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span><span>{item.quantity} {item.unit}</span><span>{euro.format(Number(item.unit_price))}</span><span>{item.tax_rate} %</span><strong>{euro.format(Number(item.total))}</strong></div>)}</div>
      <div className="pc-document-bottom"><p>{quote.notes || "Aucune note."}</p><div className="pc-totals"><span>Sous-total HT<strong>{euro.format(totals.subtotal)}</strong></span><span>TVA<strong>{euro.format(totals.tax_total)}</strong></span><span className="total">Total TTC<strong>{euro.format(totals.total)}</strong></span></div></div>
      <div className="pc-status-actions"><span>Changer l’état :</span>{(Object.keys(quoteLabels) as QuoteStatus[]).map((status) => <button key={status} disabled={status === quote.status} onClick={() => changeStatus(status)}>{quoteLabels[status]}</button>)}</div>
      <footer className="pc-details-footer"><button className="pc-danger-button" onClick={onDelete}><Trash2 size={16} /> Supprimer</button><div><button className="pc-secondary" onClick={onEdit}><Pencil size={16} /> Modifier</button><button className="pc-primary" onClick={() => setModal({ kind: "invoice", fromQuote: quote })}><ReceiptText size={16} /> Transformer en facture</button></div></footer>
    </Modal>
  );
}

function InvoiceDetails({ invoice, onClose, onEdit, onDelete, onChanged, setToast }: { invoice: Invoice; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; onChanged: () => Promise<void>; setToast: (message: string) => void }) {
  const totals = calculateTotals(invoice.items);
  async function changeStatus(status: InvoiceStatus) {
    try { await updateInvoiceStatus(invoice.id, status); await onChanged(); setToast(`Facture marquée « ${invoiceLabels[status]} ».`); onClose(); } catch (error) { setToast(error instanceof Error ? error.message : "Échec de la mise à jour."); }
  }
  async function paid() {
    try { await markInvoicePaid(invoice); await onChanged(); setToast("Paiement enregistré."); onClose(); } catch (error) { setToast(error instanceof Error ? error.message : "Échec de l’enregistrement."); }
  }
  return (
    <Modal title={invoice.number} subtitle={customerName(invoice.customer)} onClose={onClose} wide>
      <div className="pc-document-summary"><div><span>Émise le</span><strong>{formatDate(invoice.issue_date)}</strong></div><div><span>Échéance</span><strong>{formatDate(invoice.due_date)}</strong></div><div><span>État</span><Status type="invoice" value={invoice.status} /></div><div><span>Reste dû</span><strong>{euro.format(Math.max(0, Number(invoice.total) - Number(invoice.paid_total)))}</strong></div></div>
      <div className="pc-document-lines"><div className="head"><span>Désignation</span><span>Qté</span><span>PU HT</span><span>TVA</span><span>Total HT</span></div>{invoice.items.map((item) => <div key={item.id}><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span><span>{item.quantity} {item.unit}</span><span>{euro.format(Number(item.unit_price))}</span><span>{item.tax_rate} %</span><strong>{euro.format(Number(item.total))}</strong></div>)}</div>
      <div className="pc-document-bottom"><p>{invoice.notes || "Aucune note."}</p><div className="pc-totals"><span>Sous-total HT<strong>{euro.format(totals.subtotal)}</strong></span><span>TVA<strong>{euro.format(totals.tax_total)}</strong></span><span className="total">Total TTC<strong>{euro.format(totals.total)}</strong></span></div></div>
      <div className="pc-status-actions"><span>Changer l’état :</span>{(Object.keys(invoiceLabels) as InvoiceStatus[]).map((status) => <button key={status} disabled={status === invoice.status} onClick={() => changeStatus(status)}>{invoiceLabels[status]}</button>)}</div>
      <footer className="pc-details-footer"><button className="pc-danger-button" onClick={onDelete} disabled={invoice.status !== "draft"}><Trash2 size={16} /> Supprimer le brouillon</button><div><button className="pc-secondary" onClick={onEdit} disabled={invoice.status !== "draft"}><Pencil size={16} /> Modifier</button>{invoice.status !== "paid" && <button className="pc-primary" onClick={paid}><Check size={16} /> Marquer payée</button>}</div></footer>
    </Modal>
  );
}

export default function FunctionalPrototype() {
  const [section, setSection] = useState<Section>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [globalSearch, setGlobalSearch] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await fetchWorkspace();
      setCustomers(data.customers);
      setQuotes(data.quotes);
      setInvoices(data.invoices);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3200); return () => window.clearTimeout(timer); }, [toast]);

  const current = navItems.find((item) => item.id === section)?.label ?? "Projet Chapet";

  function openNew() {
    if (section === "clients") setModal({ kind: "client" });
    else if (section === "invoices") setModal({ kind: "invoice" });
    else setModal({ kind: "quote" });
  }

  async function removeCustomer(customer: Customer) {
    if (!window.confirm(`Supprimer ${customerName(customer)} ? Cette action échouera si des documents sont liés.`)) return;
    try { await deleteCustomer(customer.id); await reload(); setModal(null); setToast("Client supprimé."); } catch { setToast("Ce client possède des devis ou factures : archivez-le plutôt que de le supprimer."); }
  }

  async function removeQuote(quote: Quote) {
    if (!window.confirm(`Supprimer définitivement ${quote.number} ?`)) return;
    try { await deleteQuote(quote.id); await reload(); setModal(null); setToast("Devis supprimé."); } catch (deleteError) { setToast(deleteError instanceof Error ? deleteError.message : "Suppression impossible."); }
  }

  async function removeInvoice(invoice: Invoice) {
    if (invoice.status !== "draft") return setToast("Seuls les brouillons peuvent être supprimés. Une facture émise doit être annulée ou corrigée par un avoir.");
    if (!window.confirm(`Supprimer le brouillon ${invoice.number} ?`)) return;
    try { await deleteInvoice(invoice.id); await reload(); setModal(null); setToast("Brouillon supprimé."); } catch (deleteError) { setToast(deleteError instanceof Error ? deleteError.message : "Suppression impossible."); }
  }

  const dashboard = useMemo(() => {
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const monthInvoices = invoices.filter((invoice) => { const date = new Date(`${invoice.issue_date}T12:00:00`); return date.getMonth() === month && date.getFullYear() === year; });
    const billed = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const paid = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_total), 0);
    const pendingQuotes = quotes.filter((quote) => quote.status === "sent" || quote.status === "draft");
    const accepted = quotes.filter((quote) => quote.status === "accepted").length;
    const decided = quotes.filter((quote) => quote.status === "accepted" || quote.status === "refused").length;
    return { billed, paid, pendingQuotes, acceptance: decided ? Math.round((accepted / decided) * 100) : 0 };
  }, [quotes, invoices]);

  function Dashboard() {
    const overdue = invoices.filter((invoice) => invoice.status === "overdue");
    const acceptedToInvoice = quotes.filter((quote) => quote.status === "accepted" && !invoices.some((invoice) => invoice.quote_id === quote.id));
    return (
      <>
        <div className="pc-heading"><div><span>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span><h1>Tableau de bord</h1><p>L’essentiel de l’activité, des devis à l’encaissement.</p></div><button className="pc-secondary"><CalendarDays size={16} /> Exercice 2026 <ChevronDown size={15} /></button></div>
        <div className="pc-kpis">
          <Kpi label="Facturé ce mois" value={integerEuro.format(dashboard.billed)} note={`${invoices.length} facture${invoices.length > 1 ? "s" : ""} au total`} icon={CircleDollarSign} strong />
          <Kpi label="Encaissé ce mois" value={integerEuro.format(dashboard.paid)} note={`${integerEuro.format(Math.max(0, dashboard.billed - dashboard.paid))} à recevoir`} icon={WalletCards} />
          <Kpi label="Devis en attente" value={String(dashboard.pendingQuotes.length)} note={integerEuro.format(dashboard.pendingQuotes.reduce((sum, quote) => sum + Number(quote.total), 0)) + " de potentiel"} icon={Clock3} />
          <Kpi label="Taux d’acceptation" value={`${dashboard.acceptance} %`} note="Sur les devis décidés" icon={FileCheck2} />
        </div>
        <div className="pc-dashboard-grid">
          <section className="pc-panel pc-chart-panel"><div className="pc-panel-head"><div><span>Pilotage</span><h2>Répartition des documents</h2></div><button onClick={() => setSection("quotes")}>Voir les devis</button></div><div className="pc-live-summary"><div><strong>{quotes.length}</strong><span>devis</span></div><div><strong>{invoices.length}</strong><span>factures</span></div><div><strong>{customers.length}</strong><span>clients</span></div></div><div className="pc-live-bars"><span style={{ width: `${Math.min(100, quotes.length * 12)}%` }}>Devis</span><span style={{ width: `${Math.min(100, invoices.length * 15)}%` }}>Factures</span><span style={{ width: `${Math.min(100, customers.length * 10)}%` }}>Clients</span></div></section>
          <section className="pc-panel pc-priorities"><div className="pc-panel-head"><div><span>À traiter</span><h2>Priorités</h2></div><b>{overdue.length + acceptedToInvoice.length}</b></div>{overdue.map((invoice) => <button className="pc-priority pc-priority-danger" key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><Bell size={17} /><div><strong>Facture en retard</strong><span>{invoice.number} · {euro.format(Number(invoice.total) - Number(invoice.paid_total))}</span></div><small>Ouvrir</small></button>)}{acceptedToInvoice.map((quote) => <button className="pc-priority" key={quote.id} onClick={() => setModal({ kind: "invoice", fromQuote: quote })}><FileCheck2 size={17} /><div><strong>Devis accepté à facturer</strong><span>{customerName(quote.customer)} · {euro.format(Number(quote.total))}</span></div><small>Facturer</small></button>)}{!overdue.length && !acceptedToInvoice.length && <div className="pc-priority-empty"><Check size={18} /> Tout est à jour.</div>}</section>
        </div>
        <section className="pc-panel pc-recent"><div className="pc-panel-head"><div><span>Derniers documents</span><h2>Activité récente</h2></div><button onClick={() => setSection("quotes")}>Tout afficher</button></div>{[...quotes.slice(0, 2).map((quote) => ({ id: quote.id, type: "quote" as const, title: `${quote.number} · ${quoteLabels[quote.status]}`, subtitle: customerName(quote.customer), amount: quote.total, value: quote })), ...invoices.slice(0, 2).map((invoice) => ({ id: invoice.id, type: "invoice" as const, title: `${invoice.number} · ${invoiceLabels[invoice.status]}`, subtitle: customerName(invoice.customer), amount: invoice.total, value: invoice }))].map((item) => <button className="pc-activity" key={item.id} onClick={() => setModal(item.type === "quote" ? { kind: "quote-details", value: item.value as Quote } : { kind: "invoice-details", value: item.value as Invoice })}><i>{item.type === "quote" ? <FileText size={15} /> : <ReceiptText size={15} />}</i><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><strong>{euro.format(Number(item.amount))}</strong></button>)}</section>
      </>
    );
  }

  function QuotesView() {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"all" | QuoteStatus>("all");
    const filtered = quotes.filter((quote) => (status === "all" || quote.status === status) && `${quote.number} ${customerName(quote.customer)} ${quote.title}`.toLowerCase().includes(query.toLowerCase()));
    return <><div className="pc-heading"><div><span>Documents commerciaux</span><h1>Devis</h1><p>Créez, modifiez, supprimez, validez et transformez vos devis en factures.</p></div><button className="pc-primary" onClick={() => setModal({ kind: "quote" })}><Plus size={16} /> Nouveau devis</button></div><div className="pc-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client, numéro ou chantier…" /></label><div><SlidersHorizontal size={16} /><button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>Tous</button>{(Object.keys(quoteLabels) as QuoteStatus[]).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{quoteLabels[item]}</button>)}</div></div><section className="pc-panel pc-table-panel">{filtered.length ? <><div className="pc-table pc-quotes-table"><div className="pc-table-row pc-table-head"><span>Devis</span><span>Client / chantier</span><span>Date</span><span>Montant</span><span>État</span><span /></div>{filtered.map((quote) => <button className="pc-table-row" key={quote.id} onClick={() => setModal({ kind: "quote-details", value: quote })}><strong>{quote.number}</strong><div><strong>{customerName(quote.customer)}</strong><small>{quote.title}</small></div><span>{formatDate(quote.issue_date)}</span><strong>{euro.format(Number(quote.total))}</strong><Status type="quote" value={quote.status} /><MoreHorizontal size={18} /></button>)}</div><div className="pc-mobile-list">{filtered.map((quote) => <article key={quote.id} onClick={() => setModal({ kind: "quote-details", value: quote })}><div><span>{quote.number}</span><Status type="quote" value={quote.status} /></div><h3>{customerName(quote.customer)}</h3><p>{quote.title}</p><footer><span>{formatDate(quote.issue_date)}</span><strong>{euro.format(Number(quote.total))}</strong></footer></article>)}</div></> : <EmptyState title="Aucun devis" description="Créez votre premier devis ou modifiez les filtres." action={<button className="pc-primary" onClick={() => setModal({ kind: "quote" })}><Plus size={16} /> Nouveau devis</button>} />}</section></>;
  }

  function InvoicesView() {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
    const filtered = invoices.filter((invoice) => (status === "all" || invoice.status === status) && `${invoice.number} ${customerName(invoice.customer)}`.toLowerCase().includes(query.toLowerCase()));
    const issued = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const paid = invoices.reduce((sum, invoice) => sum + Number(invoice.paid_total), 0);
    const overdue = invoices.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + Number(invoice.total) - Number(invoice.paid_total), 0);
    return <><div className="pc-heading"><div><span>Suivi des encaissements</span><h1>Factures</h1><p>Créez les brouillons, gérez les échéances et enregistrez les paiements.</p></div><button className="pc-primary" onClick={() => setModal({ kind: "invoice" })}><Plus size={16} /> Nouvelle facture</button></div><div className="pc-kpis pc-kpis-three"><Kpi label="Total facturé" value={integerEuro.format(issued)} note={`${invoices.length} factures`} icon={ReceiptText} /><Kpi label="Déjà payé" value={integerEuro.format(paid)} note={issued ? `${Math.round((paid / issued) * 100)} % encaissé` : "0 % encaissé"} icon={Check} strong /><Kpi label="En retard" value={integerEuro.format(overdue)} note={`${invoices.filter((invoice) => invoice.status === "overdue").length} facture(s)`} icon={Bell} /></div><div className="pc-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Facture ou client…" /></label><div><SlidersHorizontal size={16} /><button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>Toutes</button>{(Object.keys(invoiceLabels) as InvoiceStatus[]).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{invoiceLabels[item]}</button>)}</div></div><section className="pc-panel pc-table-panel">{filtered.length ? <><div className="pc-table pc-invoices-table"><div className="pc-table-row pc-table-head"><span>Facture</span><span>Client</span><span>Échéance</span><span>Montant</span><span>État</span><span>Payé</span></div>{filtered.map((invoice) => <button className="pc-table-row" key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><strong>{invoice.number}</strong><strong>{customerName(invoice.customer)}</strong><span>{formatDate(invoice.due_date)}</span><strong>{euro.format(Number(invoice.total))}</strong><Status type="invoice" value={invoice.status} /><span className="pc-accountant">{euro.format(Number(invoice.paid_total))}</span></button>)}</div><div className="pc-mobile-list">{filtered.map((invoice) => <article key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><div><span>{invoice.number}</span><Status type="invoice" value={invoice.status} /></div><h3>{customerName(invoice.customer)}</h3><p>Échéance : {formatDate(invoice.due_date)}</p><footer><span>Payé {euro.format(Number(invoice.paid_total))}</span><strong>{euro.format(Number(invoice.total))}</strong></footer></article>)}</div></> : <EmptyState title="Aucune facture" description="Créez une facture ou transformez un devis accepté." action={<button className="pc-primary" onClick={() => setModal({ kind: "invoice" })}><Plus size={16} /> Nouvelle facture</button>} />}</section></>;
  }

  function ClientsView() {
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState<"all" | "business" | "individual">("all");
    const filtered = customers.filter((customer) => (kind === "all" || customer.kind === kind) && `${customerName(customer)} ${customer.siret ?? ""} ${customer.emails.join(" ")} ${customer.phones.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
    return <><div className="pc-heading"><div><span>Répertoire unifié</span><h1>Clients</h1><p>Professionnels et particuliers, plusieurs contacts et plusieurs coordonnées.</p></div><button className="pc-primary" onClick={() => setModal({ kind: "client" })}><Plus size={16} /> Nouveau client</button></div><div className="pc-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, société, SIRET, e-mail ou téléphone…" /></label><div><button className={kind === "all" ? "active" : ""} onClick={() => setKind("all")}>Tous</button><button className={kind === "business" ? "active" : ""} onClick={() => setKind("business")}>Professionnels</button><button className={kind === "individual" ? "active" : ""} onClick={() => setKind("individual")}>Particuliers</button></div></div>{filtered.length ? <div className="pc-client-grid">{filtered.map((customer) => { const customerInvoices = invoices.filter((invoice) => invoice.customer_id === customer.id); return <article className="pc-client-card" key={customer.id}><div className="pc-client-avatar">{customerName(customer).split(" ").slice(0, 2).map((word) => word[0]).join("")}</div><div className="pc-client-main"><div><span>{customer.kind === "business" ? "Professionnel" : "Particulier"}</span><h3>{customerName(customer)}</h3><p>{customer.siret ? `SIRET ${customer.siret}` : customer.addresses?.[0]?.city || "Coordonnées à compléter"}</p></div><button className="pc-icon-button" onClick={() => setModal({ kind: "client", value: customer })}><Pencil size={16} /></button></div><div className="pc-client-meta"><span>{customer.emails.length} e-mail(s) · {customer.phones.length} téléphone(s)</span><span>Facturé <strong>{integerEuro.format(customerInvoices.reduce((sum, item) => sum + Number(item.total), 0))}</strong></span></div><button className="pc-full-button" onClick={() => setModal({ kind: "client-details", value: customer })}>Ouvrir la fiche <ChevronRight size={15} /></button></article>; })}</div> : <EmptyState title="Aucun client" description="Créez un client professionnel ou particulier." action={<button className="pc-primary" onClick={() => setModal({ kind: "client" })}><Plus size={16} /> Nouveau client</button>} />}</>;
  }

  function CalendarView() {
    const dueInvoices = invoices.filter((invoice) => invoice.due_date).slice(0, 5);
    const expiringQuotes = quotes.filter((quote) => quote.expiry_date).slice(0, 5);
    return <><div className="pc-heading"><div><span>Organisation</span><h1>Agenda</h1><p>Les échéances de devis et factures sont générées depuis les documents.</p></div></div><section className="pc-panel pc-calendar-live"><div><h2>Échéances de factures</h2>{dueInvoices.map((invoice) => <button key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><CalendarDays size={17} /><span><strong>{formatDate(invoice.due_date)}</strong><small>{invoice.number} · {customerName(invoice.customer)}</small></span><Status type="invoice" value={invoice.status} /></button>)}</div><div><h2>Fin de validité des devis</h2>{expiringQuotes.map((quote) => <button key={quote.id} onClick={() => setModal({ kind: "quote-details", value: quote })}><Clock3 size={17} /><span><strong>{formatDate(quote.expiry_date)}</strong><small>{quote.number} · {customerName(quote.customer)}</small></span><Status type="quote" value={quote.status} /></button>)}</div></section></>;
  }

  function SettingsView() {
    return <><div className="pc-heading"><div><span>Configuration</span><h1>Paramètres</h1><p>Les paramètres avancés seront branchés après le cœur devis, factures et clients.</p></div><button className="pc-primary" onClick={() => setToast("Les paramètres seront connectés dans la prochaine étape.")}><Check size={16} /> Enregistrer</button></div><div className="pc-settings-grid"><section className="pc-panel pc-setting"><div className="pc-setting-title"><Building2 size={20} /><div><h2>Entreprise</h2><p>Informations légales des documents.</p></div></div><div className="pc-form-grid"><label>Raison sociale<input defaultValue="CHAPET SAS" /></label><label>SIRET<input defaultValue="892 445 112 00018" /></label><label>TVA intracommunautaire<input defaultValue="FR 32 892445112" /></label><label>Téléphone<input defaultValue="04 77 00 00 00" /></label></div></section><section className="pc-panel pc-setting"><div className="pc-setting-title"><Mail size={20} /><div><h2>Partage comptable</h2><p>Copie automatique des factures émises.</p></div></div><label className="pc-wide-label">E-mail du cabinet<input defaultValue="comptabilite@cabinet-loire.fr" /></label></section></div></>;
  }

  const content = loading ? <LoadingState /> : error ? <div className="pc-error"><strong>Erreur de connexion</strong><p>{error}</p><button className="pc-primary" onClick={() => { setLoading(true); void reload(); }}>Réessayer</button></div> : section === "dashboard" ? <Dashboard /> : section === "quotes" ? <QuotesView /> : section === "invoices" ? <InvoicesView /> : section === "clients" ? <ClientsView /> : section === "calendar" ? <CalendarView /> : <SettingsView />;

  return (
    <div className="pc-shell">
      <aside className={`pc-sidebar ${menuOpen ? "open" : ""}`}><div className="pc-brand"><div>PC</div><span><strong>Projet Chapet</strong><small>Gestion bâtiment</small></span><button className="pc-icon-button pc-menu-close" onClick={() => setMenuOpen(false)}><X size={18} /></button></div><div className="pc-company"><span>Entreprise active</span><strong>CHAPET SAS</strong><small>Saint-Étienne · Loire</small></div><nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setMenuOpen(false); }}><Icon size={18} /><span>{label}</span>{id === "invoices" && invoices.some((invoice) => invoice.status === "overdue") && <b>{invoices.filter((invoice) => invoice.status === "overdue").length}</b>}</button>)}</nav><div className="pc-sidebar-bottom"><div className="pc-support"><span>Prototype connecté</span><strong>Les données sont enregistrées dans Supabase.</strong><button onClick={() => void reload()}>Synchroniser</button></div><div className="pc-profile"><div>PC</div><span><strong>Philippe Chapet</strong><small>Mode démonstration</small></span><ChevronDown size={15} /></div></div></aside>
      {menuOpen && <button className="pc-overlay" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />}
      <div className="pc-main"><header className="pc-topbar"><div className="pc-mobile-title"><button className="pc-icon-button" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><strong>{current}</strong></div><label className="pc-global-search"><Search size={17} /><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Rechercher devis, facture ou client…" /><kbd>⌘ K</kbd></label><div className="pc-top-actions"><button className="pc-icon-button"><Bell size={18} /></button><button className="pc-voice-button pc-disabled-feature" onClick={() => setToast("La dictée vocale IA sera développée après le cœur devis / factures / clients.")}><Mic size={17} /><span>Dictée bientôt</span></button><button className="pc-primary pc-new-button" onClick={openNew}><Plus size={16} /><span>Nouveau</span></button></div></header><main className="pc-content">{globalSearch ? <GlobalResults search={globalSearch} customers={customers} quotes={quotes} invoices={invoices} setModal={setModal} clear={() => setGlobalSearch("")} /> : content}</main><nav className="pc-mobile-nav">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><Icon size={20} /><span>{label === "Tableau de bord" ? "Accueil" : label}</span></button>)}</nav><button className="pc-mobile-mic" onClick={openNew}><Plus size={23} /></button></div>
      {toast && <div className="pc-toast"><Check size={17} />{toast}</div>}
      {modal?.kind === "client" && <ClientForm customer={modal.value} onClose={() => setModal(null)} onSaved={reload} setToast={setToast} />}
      {modal?.kind === "quote" && <DocumentForm kind="quote" customers={customers} quote={modal.value} existingNumbers={quotes.map((quote) => quote.number)} onClose={() => setModal(null)} onSaved={reload} setToast={setToast} />}
      {modal?.kind === "invoice" && <DocumentForm kind="invoice" customers={customers} invoice={modal.value} fromQuote={modal.fromQuote} existingNumbers={invoices.map((invoice) => invoice.number)} onClose={() => setModal(null)} onSaved={reload} setToast={setToast} />}
      {modal?.kind === "client-details" && <ClientDetails customer={modal.value} quotes={quotes} invoices={invoices} onClose={() => setModal(null)} onEdit={() => setModal({ kind: "client", value: modal.value })} onDelete={() => removeCustomer(modal.value)} setModal={setModal} />}
      {modal?.kind === "quote-details" && <QuoteDetails quote={modal.value} onClose={() => setModal(null)} onEdit={() => setModal({ kind: "quote", value: modal.value })} onDelete={() => removeQuote(modal.value)} onChanged={reload} setModal={setModal} setToast={setToast} />}
      {modal?.kind === "invoice-details" && <InvoiceDetails invoice={modal.value} onClose={() => setModal(null)} onEdit={() => setModal({ kind: "invoice", value: modal.value })} onDelete={() => removeInvoice(modal.value)} onChanged={reload} setToast={setToast} />}
    </div>
  );
}

function GlobalResults({ search, customers, quotes, invoices, setModal, clear }: { search: string; customers: Customer[]; quotes: Quote[]; invoices: Invoice[]; setModal: (modal: ModalState) => void; clear: () => void }) {
  const term = search.toLowerCase();
  const matchingCustomers = customers.filter((customer) => `${customerName(customer)} ${customer.siret ?? ""}`.toLowerCase().includes(term));
  const matchingQuotes = quotes.filter((quote) => `${quote.number} ${customerName(quote.customer)} ${quote.title}`.toLowerCase().includes(term));
  const matchingInvoices = invoices.filter((invoice) => `${invoice.number} ${customerName(invoice.customer)}`.toLowerCase().includes(term));
  return <><div className="pc-heading"><div><span>Recherche globale</span><h1>Résultats pour « {search} »</h1><p>{matchingCustomers.length + matchingQuotes.length + matchingInvoices.length} résultat(s).</p></div><button className="pc-secondary" onClick={clear}><X size={16} /> Fermer la recherche</button></div><div className="pc-search-results"><section className="pc-panel"><h2>Clients</h2>{matchingCustomers.map((customer) => <button key={customer.id} onClick={() => setModal({ kind: "client-details", value: customer })}><UserRound size={17} /><span><strong>{customerName(customer)}</strong><small>{customer.siret || customer.emails[0] || "Client"}</small></span><ChevronRight size={16} /></button>)}</section><section className="pc-panel"><h2>Devis</h2>{matchingQuotes.map((quote) => <button key={quote.id} onClick={() => setModal({ kind: "quote-details", value: quote })}><FileText size={17} /><span><strong>{quote.number}</strong><small>{customerName(quote.customer)} · {quote.title}</small></span><strong>{euro.format(Number(quote.total))}</strong></button>)}</section><section className="pc-panel"><h2>Factures</h2>{matchingInvoices.map((invoice) => <button key={invoice.id} onClick={() => setModal({ kind: "invoice-details", value: invoice })}><ReceiptText size={17} /><span><strong>{invoice.number}</strong><small>{customerName(invoice.customer)}</small></span><strong>{euro.format(Number(invoice.total))}</strong></button>)}</section></div></>;
}
