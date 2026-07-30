"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileDown,
  FileText,
  Home,
  Mail,
  Menu,
  Mic,
  Palette,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Tab = "home" | "quotes" | "invoices" | "clients" | "agenda";
type CreateKind = "quote" | "invoice" | "client" | "agenda";
type Drawer = "menu" | "collaborators" | "company" | "accounting" | "settings" | null;
type QuoteStatus = "En attente" | "Validé" | "Terminé" | "Refusé";
type InvoiceStatus = "Brouillon" | "En cours" | "Payée" | "En retard";

type Quote = {
  id: string;
  client: string;
  amount: string;
  expiry: string;
  issueDate: string;
  status: QuoteStatus;
  project: string;
};

type Invoice = {
  id: string;
  client: string;
  amount: string;
  due: string;
  issueDate: string;
  status: InvoiceStatus;
  accountantSent: boolean;
};

type Client = {
  id: string;
  name: string;
  kind: "Professionnel" | "Particulier";
  city: string;
  phone: string;
  phone2?: string;
  email: string;
  email2?: string;
  siret?: string;
  vat?: string;
  address: string;
};

type AgendaItem = {
  id: string;
  date: string;
  time: string;
  type: "Chantier" | "Facturation" | "Commande" | "Relance";
  title: string;
  client: string;
};

const initialQuotes: Quote[] = [
  { id: "D-2026-378", client: "Isabelle DECHAUD", amount: "1 015,74 €", expiry: "Exp. le 28 août 2026", issueDate: "30 juil. 2026", status: "En attente", project: "Peinture séjour et couloir" },
  { id: "D-2026-377", client: "Françoise SOULIER", amount: "341,00 €", expiry: "Exp. le 28 août 2026", issueDate: "29 juil. 2026", status: "Validé", project: "Reprise plafond cuisine" },
  { id: "D-2026-376", client: "SCI BELLEVUE", amount: "2 240,00 €", expiry: "Exp. le 18 août 2026", issueDate: "18 juil. 2026", status: "En attente", project: "Hall d’entrée" },
  { id: "D-2026-375", client: "Émilie MOLLE", amount: "15 703,61 €", expiry: "Exp. le 27 août 2026", issueDate: "27 juin 2026", status: "En attente", project: "Rénovation complète" },
  { id: "D-2026-374", client: "Sébastien THIEL", amount: "828,85 €", expiry: "Exp. le 27 août 2026", issueDate: "27 juin 2026", status: "Terminé", project: "Dégât des eaux" },
  { id: "D-2026-373", client: "ALAIN TRONCHET IMMOBILIER", amount: "492,00 €", expiry: "Exp. le 25 août 2026", issueDate: "25 juin 2026", status: "Validé", project: "Remise en peinture bureau" },
];

const initialInvoices: Invoice[] = [
  { id: "F-2026-017", client: "CHAPET Père & Fils", amount: "2 916,00 €", due: "Éch. le 10 août 2026", issueDate: "10 juil. 2026", status: "Payée", accountantSent: true },
  { id: "F-2026-018", client: "SCI BELLEVUE", amount: "1 344,00 €", due: "Éch. le 12 août 2026", issueDate: "12 juil. 2026", status: "En cours", accountantSent: true },
  { id: "F-2026-019", client: "Justine PONSIN", amount: "341,00 €", due: "Éch. le 9 août 2026", issueDate: "9 juil. 2026", status: "Brouillon", accountantSent: false },
  { id: "F-2026-020", client: "Garage du Crêt", amount: "1 890,00 €", due: "Éch. le 4 août 2026", issueDate: "4 juil. 2026", status: "En retard", accountantSent: true },
];

const initialClients: Client[] = [
  { id: "C-001", name: "CHAPET Père & Fils", kind: "Professionnel", city: "Saint-Étienne", phone: "06 81 20 14 88", phone2: "04 77 21 09 14", email: "contact@saschapet.com", email2: "compta@saschapet.com", siret: "879 214 563 00012", vat: "FR 12 879214563", address: "18 rue Jean-Neyret, 42000 Saint-Étienne" },
  { id: "C-002", name: "SCI BELLEVUE", kind: "Professionnel", city: "Monistrol-sur-Loire", phone: "06 71 52 10 33", email: "gestion@scibellevue.fr", siret: "843 621 540 00018", vat: "FR 89 843621540", address: "4 place du Monteil, 43120 Monistrol-sur-Loire" },
  { id: "C-003", name: "Isabelle DECHAUD", kind: "Particulier", city: "Roche-la-Molière", phone: "06 22 84 13 57", email: "isabelle.dechaud@mail.fr", address: "8 rue des Lilas, 42230 Roche-la-Molière" },
  { id: "C-004", name: "Françoise SOULIER", kind: "Particulier", city: "Firminy", phone: "06 19 54 74 12", email: "f.soulier@mail.fr", address: "14 avenue de la Gare, 42700 Firminy" },
  { id: "C-005", name: "ALAIN TRONCHET IMMOBILIER", kind: "Professionnel", city: "Saint-Chamond", phone: "04 77 20 11 09", email: "contact@tronchet-immo.fr", siret: "402 208 813 00024", vat: "FR 38 402208813", address: "21 rue de la République, 42400 Saint-Chamond" },
];

const agendaItems: AgendaItem[] = [
  { id: "A-01", date: "Aujourd’hui", time: "08:30", type: "Commande", title: "Commander peinture façade", client: "SCI Bellevue" },
  { id: "A-02", date: "Aujourd’hui", time: "10:00", type: "Chantier", title: "Visite avant démarrage", client: "Mme Robin" },
  { id: "A-03", date: "Aujourd’hui", time: "14:00", type: "Facturation", title: "Émettre facture de situation", client: "Garage du Crêt" },
  { id: "A-04", date: "Demain", time: "09:00", type: "Relance", title: "Relancer devis D-2026-376", client: "SCI Bellevue" },
  { id: "A-05", date: "Demain", time: "13:30", type: "Chantier", title: "Démarrage préparation murs", client: "Françoise Soulier" },
];

function StatusPill({ status }: { status: QuoteStatus | InvoiceStatus }) {
  const slug = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-");
  return <span className={`rm-status rm-status-${slug}`}>{status}</span>;
}

function tabTitle(tab: Tab) {
  if (tab === "home") return "Accueil";
  if (tab === "quotes") return "Devis";
  if (tab === "invoices") return "Factures";
  if (tab === "clients") return "Clients";
  return "Agenda";
}

export default function RappidosMobileShell() {
  const [tab, setTab] = useState<Tab>("home");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [quoteFilter, setQuoteFilter] = useState("Tous");
  const [invoiceFilter, setInvoiceFilter] = useState("Toutes");
  const [creating, setCreating] = useState<CreateKind | null>(null);
  const [listening, setListening] = useState(false);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [clients] = useState(initialClients);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [toast, setToast] = useState("");

  const filteredQuotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return quotes.filter((quote) => {
      const matchesSearch = !term || `${quote.client} ${quote.id} ${quote.amount} ${quote.project}`.toLowerCase().includes(term);
      const matchesFilter = quoteFilter === "Tous" || quote.status === quoteFilter;
      return matchesSearch && matchesFilter;
    });
  }, [query, quoteFilter, quotes]);

  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesSearch = !term || `${invoice.client} ${invoice.id} ${invoice.amount}`.toLowerCase().includes(term);
      const matchesFilter = invoiceFilter === "Toutes" || invoice.status === invoiceFilter;
      return matchesSearch && matchesFilter;
    });
  }, [query, invoiceFilter, invoices]);

  const filteredClients = useMemo(() => {
    const term = query.trim().toLowerCase();
    return clients.filter((client) => !term || `${client.name} ${client.kind} ${client.city} ${client.phone} ${client.email}`.toLowerCase().includes(term));
  }, [query, clients]);

  function switchTab(next: Tab) {
    setTab(next);
    setQuery("");
    setQuoteFilter("Tous");
    setInvoiceFilter("Toutes");
    setDrawer(null);
  }

  function openCreate(ai = false) {
    const kind: CreateKind = tab === "invoices" ? "invoice" : tab === "clients" ? "client" : tab === "agenda" ? "agenda" : "quote";
    setCreating(kind);
    setListening(ai);
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function setQuoteStatus(status: QuoteStatus) {
    if (!selectedQuote) return;
    const updated = { ...selectedQuote, status };
    setQuotes((current) => current.map((quote) => quote.id === updated.id ? updated : quote));
    setSelectedQuote(updated);
    notify(`Devis remis en état « ${status} ».`);
  }

  function deleteSelectedQuote() {
    if (!selectedQuote) return;
    setQuotes((current) => current.filter((quote) => quote.id !== selectedQuote.id));
    setSelectedQuote(null);
    notify("Devis supprimé du prototype.");
  }

  function markSelectedInvoicePaid() {
    if (!selectedInvoice) return;
    const updated = { ...selectedInvoice, status: "Payée" as InvoiceStatus };
    setInvoices((current) => current.map((invoice) => invoice.id === updated.id ? updated : invoice));
    setSelectedInvoice(updated);
    notify("Facture marquée comme payée.");
  }

  return (
    <div className="rm-shell">
      <div className="rm-app">
        <header className="rm-header">
          <button className="rm-header-menu" onClick={() => setDrawer("menu")} aria-label="Menu"><Menu size={24} /></button>
          <h1>{tabTitle(tab)}</h1>
          <div className="rm-header-actions">
            <button aria-label="Notifications"><Bell size={21} /></button>
            <button className="rm-header-plus" onClick={() => openCreate(false)} aria-label="Créer"><Plus size={23} /></button>
          </div>
        </header>

        <main className="rm-content">
          {tab === "home" && (
            <section className="rm-section rm-home-section">
              <div className="rm-scroll-area">
                <div className="rm-home-hero">
                  <span>PILOTAGE ENTREPRISE</span>
                  <strong>18 642 €</strong>
                  <small>Chiffre d’affaires facturé en juillet</small>
                  <div><b>+ 11,8 %</b><span>par rapport à juillet N-1</span></div>
                </div>

                <div className="rm-kpi-grid">
                  <button><FileText size={20} /><strong>3</strong><span>Devis en attente</span></button>
                  <button><AlertTriangle size={20} /><strong>1 890 €</strong><span>Factures en retard</span></button>
                  <button><CheckCircle2 size={20} /><strong>9 840 €</strong><span>Encaissé ce mois</span></button>
                  <button><BarChart3 size={20} /><strong>126 400 €</strong><span>CA annuel</span></button>
                </div>

                <div className="rm-home-panel">
                  <div className="rm-panel-title"><div><span>À TRAITER</span><strong>Priorités du jour</strong></div><small>4 actions</small></div>
                  <button onClick={() => switchTab("invoices")}><span className="rm-task-icon danger"><AlertTriangle size={18} /></span><div><strong>Facture F-2026-020 en retard</strong><small>Garage du Crêt · 1 890,00 €</small></div><ChevronRight size={18} /></button>
                  <button onClick={() => switchTab("quotes")}><span className="rm-task-icon"><Clock3 size={18} /></span><div><strong>3 devis à relancer</strong><small>Expiration dans moins de 15 jours</small></div><ChevronRight size={18} /></button>
                  <button onClick={() => setDrawer("accounting")}><span className="rm-task-icon success"><Mail size={18} /></span><div><strong>Copie comptable active</strong><small>Les factures émises sont transférées automatiquement</small></div><ChevronRight size={18} /></button>
                </div>

                <div className="rm-home-panel">
                  <div className="rm-panel-title"><div><span>ACTIVITÉ</span><strong>Prochains rendez-vous</strong></div><button onClick={() => switchTab("agenda")}>Voir tout</button></div>
                  {agendaItems.slice(0, 3).map((item) => (
                    <button key={item.id} onClick={() => switchTab("agenda")}><span className="rm-agenda-time">{item.time}</span><div><strong>{item.title}</strong><small>{item.client}</small></div><ChevronRight size={18} /></button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {tab === "quotes" && (
            <section className="rm-section">
              <div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un devis" /></div>
              <div className="rm-segmented">
                {["Tous", "En attente", "Validé", "Terminé"].map((item) => <button key={item} className={quoteFilter === item ? "active" : ""} onClick={() => setQuoteFilter(item)}>{item}</button>)}
              </div>
              <div className="rm-scroll-area rm-list-scroll">
                <section className="rm-list">
                  {filteredQuotes.map((quote) => (
                    <button className="rm-document-card" key={quote.id} onClick={() => setSelectedQuote(quote)}>
                      <div className="rm-document-main"><strong>{quote.client}</strong><small>{quote.id}</small><StatusPill status={quote.status} /></div>
                      <div className="rm-document-side"><strong>{quote.amount}</strong><small>{quote.expiry}</small><ChevronRight size={18} /></div>
                    </button>
                  ))}
                </section>
              </div>
            </section>
          )}

          {tab === "invoices" && (
            <section className="rm-section">
              <div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une facture" /></div>
              <div className="rm-segmented rm-four">
                {["Toutes", "Brouillon", "En cours", "Payée"].map((item) => <button key={item} className={invoiceFilter === item ? "active" : ""} onClick={() => setInvoiceFilter(item)}>{item}</button>)}
              </div>
              <div className="rm-scroll-area rm-list-scroll">
                <section className="rm-list">
                  {filteredInvoices.map((invoice) => (
                    <button className="rm-document-card" key={invoice.id} onClick={() => setSelectedInvoice(invoice)}>
                      <div className="rm-document-main"><strong>{invoice.client}</strong><small>{invoice.id}</small><StatusPill status={invoice.status} /></div>
                      <div className="rm-document-side"><strong>{invoice.amount}</strong><small>{invoice.due}</small><ChevronRight size={18} /></div>
                    </button>
                  ))}
                </section>
              </div>
            </section>
          )}

          {tab === "clients" && (
            <section className="rm-section">
              <div className="rm-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client" /></div>
              <div className="rm-client-count"><span>{filteredClients.length} clients</span><small>Pros et particuliers</small></div>
              <div className="rm-scroll-area rm-list-scroll">
                <section className="rm-list rm-client-list">
                  {filteredClients.map((client) => (
                    <button className="rm-client-card" key={client.id} onClick={() => setSelectedClient(client)}><span className="rm-client-avatar"><CircleUserRound size={24} /></span><div><strong>{client.name}</strong><small>{client.kind} · {client.city}</small><span>{client.phone}</span></div><ChevronRight size={19} /></button>
                  ))}
                </section>
              </div>
            </section>
          )}

          {tab === "agenda" && (
            <section className="rm-section">
              <div className="rm-agenda-summary">
                <button className="active">Aujourd’hui <strong>3</strong></button>
                <button>Cette semaine <strong>7</strong></button>
                <button>À facturer <strong>2</strong></button>
              </div>
              <div className="rm-scroll-area rm-list-scroll">
                <div className="rm-agenda-list">
                  {agendaItems.map((item, index) => (
                    <div key={item.id}>
                      {(index === 0 || agendaItems[index - 1].date !== item.date) && <h2>{item.date}</h2>}
                      <button><span className={`rm-agenda-type rm-agenda-${item.type.toLowerCase()}`}>{item.type}</span><div><strong>{item.time} · {item.title}</strong><small>{item.client}</small></div><ChevronRight size={18} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>

        <div className="rm-create-dock">
          <button className="rm-create-main" onClick={() => openCreate(false)}><Plus size={20} /><span>Créer</span></button>
          <button className="rm-create-ai" onClick={() => openCreate(true)} aria-label="Créer avec le micro IA"><Mic size={24} /><small>IA</small></button>
        </div>

        <nav className="rm-bottom-nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => switchTab("home")}><Home size={24} /><span>Accueil</span></button>
          <button className={tab === "quotes" ? "active" : ""} onClick={() => switchTab("quotes")}><FileText size={24} /><span>Devis</span></button>
          <button className={tab === "invoices" ? "active" : ""} onClick={() => switchTab("invoices")}><ReceiptText size={24} /><span>Factures</span></button>
          <button className={tab === "clients" ? "active" : ""} onClick={() => switchTab("clients")}><UsersRound size={24} /><span>Clients</span></button>
          <button className={tab === "agenda" ? "active" : ""} onClick={() => switchTab("agenda")}><CalendarDays size={24} /><span>Agenda</span></button>
        </nav>
      </div>

      {drawer && (
        <div className="rm-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
          <aside className="rm-side-drawer">
            <header><button onClick={() => setDrawer(null)}><X size={21} /></button><div><small>PROJET CHAPET</small><strong>{drawer === "menu" ? "Menu" : drawer === "collaborators" ? "Collaborateurs" : drawer === "company" ? "Mon entreprise" : drawer === "accounting" ? "Comptabilité" : "Paramètres"}</strong></div></header>

            {drawer === "menu" && <div className="rm-drawer-list">
              <button onClick={() => setDrawer("collaborators")}><span><Wrench size={21} /></span><div><strong>Interface collaborateurs</strong><small>Consignes, photos et documents sans prix</small></div><ChevronRight size={19} /></button>
              <button onClick={() => setDrawer("company")}><span><Building2 size={21} /></span><div><strong>Mon entreprise</strong><small>SIRET, TVA, banque et exercice comptable</small></div><ChevronRight size={19} /></button>
              <button onClick={() => setDrawer("accounting")}><span><Mail size={21} /></span><div><strong>Comptable & facturation</strong><small>Envoi automatique, paiements et facture électronique</small></div><ChevronRight size={19} /></button>
              <button onClick={() => setDrawer("settings")}><span><Settings size={21} /></span><div><strong>Personnalisation</strong><small>Logo, couleurs, numérotation et e-mails</small></div><ChevronRight size={19} /></button>
            </div>}

            {drawer === "collaborators" && <div className="rm-drawer-content">
              <div className="rm-info-hero"><Wrench size={25} /><h2>Mode chantier</h2><p>Les exécutants voient les consignes, plans et documents sans prix ni marge.</p></div>
              <button className="rm-work-card"><div><small>CHANTIER EN COURS</small><strong>SCI Bellevue · Hall d’entrée</strong><span>Peinture murs et plafond · 18 m²</span></div><ChevronRight size={20} /></button>
              <div className="rm-action-grid"><button><Camera size={18} /> Ajouter des photos</button><button><AlertTriangle size={18} /> Signaler un problème</button><button><Check size={18} /> Étape terminée</button><button><FileDown size={18} /> Document sans prix</button></div>
            </div>}

            {drawer === "company" && <div className="rm-drawer-content rm-settings-cards">
              <div><span>Raison sociale</span><strong>CHAPET Père & Fils</strong></div>
              <div><span>SIRET</span><strong>879 214 563 00012</strong></div>
              <div><span>TVA intracommunautaire</span><strong>FR 12 879214563</strong></div>
              <div><span>Exercice comptable</span><strong>01 janvier → 31 décembre</strong></div>
              <div><span>IBAN</span><strong>FR76 •••• •••• •••• 4521</strong></div>
              <button><Pencil size={18} /> Modifier les informations</button>
            </div>}

            {drawer === "accounting" && <div className="rm-drawer-content rm-settings-cards">
              <div><span>Copie automatique au comptable</span><strong>compta@saschapet.com</strong><b>Activée</b></div>
              <div><span>Facturation électronique</span><strong>Module en préparation</strong><small>Connexion future à une plateforme agréée</small></div>
              <div><span>Encaissements</span><strong>Suivi manuel + prélèvement abonnement</strong></div>
              <button onClick={() => notify("Test d’envoi comptable réussi.")}><Send size={18} /> Tester l’envoi comptable</button>
            </div>}

            {drawer === "settings" && <div className="rm-drawer-content rm-settings-cards">
              <div><span>Logo de l’entreprise</span><strong>Logo CHAPET</strong></div>
              <div><span>Couleur des documents</span><strong>Bleu professionnel</strong><Palette size={19} /></div>
              <div><span>Validité des devis</span><strong>2 mois par défaut</strong></div>
              <div><span>Numérotation</span><strong>D-2026-XXX / F-2026-XXX</strong></div>
              <div><span>E-mails d’envoi</span><strong>Sans marque du logiciel</strong></div>
              <button><Settings size={18} /> Ouvrir tous les paramètres</button>
            </div>}
          </aside>
        </div>
      )}

      {creating && (
        <div className="rm-modal-backdrop">
          <section className="rm-create-sheet">
            <header><button onClick={() => { setCreating(null); setListening(false); }}><X size={20} /></button><h2>{creating === "quote" ? "Nouveau devis" : creating === "invoice" ? "Nouvelle facture" : creating === "client" ? "Nouveau client" : "Nouvel événement"}</h2><span /></header>

            {creating === "client" ? (
              <div className="rm-form-stack">
                <div className="rm-kind-switch"><button className="active">Professionnel</button><button>Particulier</button></div>
                <label>Raison sociale<div><input placeholder="Nom de l’entreprise" /><Mic size={18} /></div></label>
                <label>SIRET<div><input placeholder="14 chiffres" /><Mic size={18} /></div></label>
                <label>TVA intracommunautaire<div><input placeholder="FR…" /><Mic size={18} /></div></label>
                <label>E-mails<div><input placeholder="E-mail principal" /><Mic size={18} /></div><input placeholder="Second e-mail" /></label>
                <label>Téléphones<div><input placeholder="Téléphone principal" /><Mic size={18} /></div><input placeholder="Second téléphone" /></label>
                <label>Adresse<div><input placeholder="Adresse complète" /><Mic size={18} /></div></label>
              </div>
            ) : creating === "agenda" ? (
              <div className="rm-form-stack">
                <label>Type<select><option>Chantier</option><option>Commande</option><option>Facturation</option><option>Relance</option></select></label>
                <label>Client<div><input placeholder="Rechercher un client" /><Search size={18} /></div></label>
                <label>Date et heure<div><input value="30/07/2026 · 14:00" readOnly /><CalendarDays size={18} /></div></label>
                <label>Consigne<div><input placeholder="Dicter ou saisir la tâche" /><Mic size={18} /></div></label>
              </div>
            ) : (
              <>
                <button className="rm-form-card"><div><small>Client</small><strong>Rechercher ou créer le client</strong></div><ChevronRight size={19} /></button>
                <button className="rm-form-card"><div><small>Document</small><strong>{creating === "quote" ? "D-2026-379" : "F-2026-021"}</strong><span>Émission aujourd’hui · {creating === "quote" ? "expiration dans 2 mois" : "échéance modifiable"}</span></div><ChevronRight size={19} /></button>
                <div className="rm-products-title"><span>Produits et services</span><button><Plus size={21} /></button></div>
                <div className="rm-ai-create-row">
                  <button className="rm-ai-create-text" onClick={() => setListening(true)}><span>Créer</span><small>le document avec l’IA</small></button>
                  <button className={`rm-voice-button ${listening ? "listening" : ""}`} onClick={() => setListening((value) => !value)}><Mic size={25} /><small>IA</small></button>
                </div>
                <button className="rm-manual-line"><Plus size={17} /> Ajouter une ligne manuellement</button>
                {listening && <div className="rm-transcript"><span>Transcription</span><p>« RSE, franchise, 125 euros TTC. Peinture murale 18 m² à 32 euros le m². »</p><div><Check size={17} /> 2 lignes reconnues · calculs à valider</div></div>}
              </>
            )}

            <footer><div><small>{creating === "client" || creating === "agenda" ? "État" : "Total HT"}</small><strong>{creating === "client" ? "Fiche complète" : creating === "agenda" ? "Prêt à planifier" : listening ? "689,64 €" : "0,00 €"}</strong>{creating !== "client" && creating !== "agenda" && <small>TVA : {listening ? "68,96 €" : "0,00 €"}</small>}</div><div><button className="rm-outline-button">{creating === "quote" || creating === "invoice" ? "Aperçu" : "Annuler"}</button><button className="rm-save-button" onClick={() => { notify("Création enregistrée."); setCreating(null); setListening(false); }}>Enregistrer</button></div></footer>
          </section>
        </div>
      )}

      {selectedQuote && (
        <div className="rm-modal-backdrop">
          <section className="rm-detail-sheet">
            <header><button onClick={() => setSelectedQuote(null)}><ArrowLeft size={20} /></button><div><small>DEVIS</small><h2>{selectedQuote.id}</h2></div><button><Pencil size={19} /></button></header>
            <button className="rm-detail-client" onClick={() => setSelectedClient(clients.find((client) => selectedQuote.client.toLowerCase().includes(client.name.toLowerCase().split(" ")[0])) ?? clients[0])}><span><CircleUserRound size={23} /></span><div><small>Client</small><strong>{selectedQuote.client}</strong></div><ChevronRight size={19} /></button>
            <div className="rm-detail-amount"><small>Montant TTC</small><strong>{selectedQuote.amount}</strong><span>{selectedQuote.project}</span></div>
            <div className="rm-detail-dates"><div><span>Émis le</span><strong>{selectedQuote.issueDate}</strong></div><div><span>Validité</span><strong>{selectedQuote.expiry}</strong></div></div>
            <div className="rm-status-editor"><span>État du devis</span><div>{(["En attente", "Validé", "Terminé", "Refusé"] as QuoteStatus[]).map((status) => <button key={status} className={selectedQuote.status === status ? "active" : ""} onClick={() => setQuoteStatus(status)}>{status}</button>)}</div></div>
            <div className="rm-detail-actions"><button><FileDown size={18} /> PDF complet</button><button><FileDown size={18} /> PDF sans prix</button><button><Mail size={18} /> Envoyer par e-mail</button><button><RefreshCw size={18} /> Transformer en facture</button><button><Pencil size={18} /> Modifier le devis</button><button className="danger" onClick={deleteSelectedQuote}><Trash2 size={18} /> Supprimer</button></div>
          </section>
        </div>
      )}

      {selectedInvoice && (
        <div className="rm-modal-backdrop">
          <section className="rm-detail-sheet">
            <header><button onClick={() => setSelectedInvoice(null)}><ArrowLeft size={20} /></button><div><small>FACTURE</small><h2>{selectedInvoice.id}</h2></div><button><Pencil size={19} /></button></header>
            <button className="rm-detail-client"><span><CircleUserRound size={23} /></span><div><small>Client</small><strong>{selectedInvoice.client}</strong></div><ChevronRight size={19} /></button>
            <div className="rm-detail-amount"><small>Montant TTC</small><strong>{selectedInvoice.amount}</strong><StatusPill status={selectedInvoice.status} /></div>
            <div className="rm-detail-dates"><div><span>Émise le</span><strong>{selectedInvoice.issueDate}</strong></div><div><span>Échéance</span><strong>{selectedInvoice.due}</strong></div></div>
            <div className="rm-accountant-state"><Mail size={19} /><div><strong>{selectedInvoice.accountantSent ? "Envoyée au comptable" : "Pas encore envoyée"}</strong><small>Copie automatique configurable dans les paramètres</small></div></div>
            <div className="rm-detail-actions"><button onClick={markSelectedInvoicePaid}><CheckCircle2 size={18} /> Marquer payée</button><button><Pencil size={18} /> Modifier les dates</button><button><Mail size={18} /> Envoyer au client</button><button><Send size={18} /> Renvoyer au comptable</button><button><RefreshCw size={18} /> Créer un avoir</button>{selectedInvoice.status === "Brouillon" && <button className="danger"><Trash2 size={18} /> Supprimer le brouillon</button>}</div>
          </section>
        </div>
      )}

      {selectedClient && (
        <div className="rm-modal-backdrop">
          <section className="rm-detail-sheet">
            <header><button onClick={() => setSelectedClient(null)}><ArrowLeft size={20} /></button><div><small>CLIENT</small><h2>{selectedClient.name}</h2></div><button><Pencil size={19} /></button></header>
            <div className="rm-client-detail-head"><span><CircleUserRound size={30} /></span><div><strong>{selectedClient.kind}</strong><small>{selectedClient.city}</small></div></div>
            <div className="rm-client-fields"><div><span>Téléphones</span><strong>{selectedClient.phone}</strong>{selectedClient.phone2 && <small>{selectedClient.phone2}</small>}</div><div><span>E-mails</span><strong>{selectedClient.email}</strong>{selectedClient.email2 && <small>{selectedClient.email2}</small>}</div><div><span>Adresse</span><strong>{selectedClient.address}</strong></div>{selectedClient.siret && <div><span>SIRET</span><strong>{selectedClient.siret}</strong><small>{selectedClient.vat}</small></div>}</div>
            <div className="rm-detail-actions"><button><FileText size={18} /> Voir les devis</button><button><ReceiptText size={18} /> Voir les factures</button><button><Pencil size={18} /> Modifier le client</button><button><Plus size={18} /> Nouveau devis</button></div>
          </section>
        </div>
      )}

      {toast && <div className="rm-toast"><Check size={18} />{toast}</div>}
    </div>
  );
}
