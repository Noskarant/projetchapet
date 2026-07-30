"use client";

import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  FileText,
  LayoutGrid,
  Menu,
  Mic,
  Plus,
  ReceiptText,
  Search,
  Settings,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Tab = "quotes" | "invoices" | "menu";
type MenuScreen = "home" | "clients" | "collaborators";

type Quote = {
  id: string;
  client: string;
  amount: string;
  expiry: string;
  status: "En attente" | "Validé" | "Terminé";
};

type Invoice = {
  id: string;
  client: string;
  amount: string;
  due: string;
  status: "En cours" | "Payée" | "En retard";
};

const quotes: Quote[] = [
  { id: "D-2026-378", client: "Isabelle DECHAUD", amount: "1 015,74 €", expiry: "Exp. le 28 août 2026", status: "En attente" },
  { id: "D-2026-377", client: "Françoise SOULIER", amount: "341,00 €", expiry: "Exp. le 28 août 2026", status: "Validé" },
  { id: "D-2026-376", client: "SCI BELLEVUE", amount: "2 240,00 €", expiry: "Exp. le 18 août 2026", status: "En attente" },
  { id: "D-2026-375", client: "Émilie MOLLE", amount: "15 703,61 €", expiry: "Exp. le 27 août 2026", status: "En attente" },
  { id: "D-2026-374", client: "Sébastien THIEL", amount: "828,85 €", expiry: "Exp. le 27 août 2026", status: "Terminé" },
  { id: "D-2026-373", client: "ALAIN TRONCHET IMMOBILIER", amount: "492,00 €", expiry: "Exp. le 25 août 2026", status: "Validé" },
];

const invoices: Invoice[] = [
  { id: "F-2026-017", client: "CHAPET Père & Fils", amount: "2 916,00 €", due: "Éch. le 10 août 2026", status: "Payée" },
  { id: "F-2026-018", client: "SCI BELLEVUE", amount: "1 344,00 €", due: "Éch. le 12 août 2026", status: "En cours" },
  { id: "F-2026-019", client: "Justine PONSIN", amount: "341,00 €", due: "Éch. le 9 août 2026", status: "En cours" },
  { id: "F-2026-020", client: "Garage du Crêt", amount: "1 890,00 €", due: "Éch. le 4 août 2026", status: "En retard" },
];

const clients = [
  { name: "CHAPET Père & Fils", meta: "Professionnel · Saint-Étienne", phone: "06 81 20 14 88" },
  { name: "SCI BELLEVUE", meta: "Professionnel · Monistrol-sur-Loire", phone: "06 71 52 10 33" },
  { name: "Isabelle DECHAUD", meta: "Particulier · Roche-la-Molière", phone: "06 22 84 13 57" },
  { name: "Françoise SOULIER", meta: "Particulier · Firminy", phone: "06 19 54 74 12" },
  { name: "ALAIN TRONCHET IMMOBILIER", meta: "Professionnel · Saint-Chamond", phone: "04 77 20 11 09" },
];

function StatusPill({ status }: { status: Quote["status"] | Invoice["status"] }) {
  const slug = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-");
  return <span className={`rm-status rm-status-${slug}`}>{status}</span>;
}

export default function RappidosMobileShell() {
  const [tab, setTab] = useState<Tab>("quotes");
  const [menuScreen, setMenuScreen] = useState<MenuScreen>("home");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tous");
  const [creating, setCreating] = useState<"quote" | "invoice" | null>(null);
  const [listening, setListening] = useState(false);

  const filteredQuotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return quotes.filter((quote) => {
      const matchesSearch = !term || `${quote.client} ${quote.id} ${quote.amount}`.toLowerCase().includes(term);
      const matchesFilter = filter === "Tous" || (filter === "En attente" && quote.status === "En attente") || (filter === "Terminés" && quote.status === "Terminé") || (filter === "Validés" && quote.status === "Validé");
      return matchesSearch && matchesFilter;
    });
  }, [query, filter]);

  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return invoices.filter((invoice) => !term || `${invoice.client} ${invoice.id} ${invoice.amount}`.toLowerCase().includes(term));
  }, [query]);

  function changeTab(next: Tab) {
    setTab(next);
    setMenuScreen("home");
    setQuery("");
    setFilter("Tous");
  }

  function title() {
    if (tab === "quotes") return "Devis";
    if (tab === "invoices") return "Factures";
    if (menuScreen === "clients") return "Clients";
    if (menuScreen === "collaborators") return "Collaborateurs";
    return "Menu";
  }

  return (
    <div className="rm-shell">
      <div className="rm-app">
        <header className="rm-header">
          <div className="rm-title-wrap">
            {tab === "menu" && menuScreen !== "home" ? (
              <button className="rm-round-button" onClick={() => setMenuScreen("home")} aria-label="Retour"><ArrowLeft size={19} /></button>
            ) : (
              <span className="rm-title-icon">{tab === "quotes" ? <FileText size={19} /> : tab === "invoices" ? <ReceiptText size={19} /> : <Menu size={19} />}</span>
            )}
            <h1>{title()}</h1>
          </div>
          <button className="rm-round-button" aria-label="Paramètres"><Settings size={19} /></button>
        </header>

        <main className="rm-content">
          {tab === "quotes" && (
            <>
              <div className="rm-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un devis" /></div>
              <div className="rm-segmented">
                {["Tous", "En attente", "Validés", "Terminés"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
              </div>
              <section className="rm-list">
                {filteredQuotes.map((quote) => (
                  <button className="rm-document-card" key={quote.id}>
                    <div className="rm-document-main"><strong>{quote.client}</strong><small>{quote.id}</small><StatusPill status={quote.status} /></div>
                    <div className="rm-document-side"><strong>{quote.amount}</strong><small>{quote.expiry}</small><ChevronRight size={17} /></div>
                  </button>
                ))}
              </section>
              <button className="rm-primary-fab" onClick={() => setCreating("quote")}>Nouveau devis <Plus size={20} /></button>
            </>
          )}

          {tab === "invoices" && (
            <>
              <div className="rm-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une facture" /></div>
              <div className="rm-segmented rm-three"><button className="active">Toutes</button><button>En cours</button><button>Payées</button></div>
              <section className="rm-list">
                {filteredInvoices.map((invoice) => (
                  <button className="rm-document-card" key={invoice.id}>
                    <div className="rm-document-main"><strong>{invoice.client}</strong><small>{invoice.id}</small><StatusPill status={invoice.status} /></div>
                    <div className="rm-document-side"><strong>{invoice.amount}</strong><small>{invoice.due}</small><ChevronRight size={17} /></div>
                  </button>
                ))}
              </section>
              <button className="rm-primary-fab" onClick={() => setCreating("invoice")}>Nouvelle facture <Plus size={20} /></button>
            </>
          )}

          {tab === "menu" && menuScreen === "home" && (
            <section className="rm-menu-list">
              <button onClick={() => setMenuScreen("clients")}><span className="rm-menu-icon"><UsersRound size={21} /></span><div><strong>Clients</strong><small>Rechercher, créer et modifier les fiches</small></div><ChevronRight size={19} /></button>
              <button><span className="rm-menu-icon"><BarChart3 size={21} /></span><div><strong>Tableau de bord</strong><small>Chiffre d’affaires, paiements et N-1</small></div><ChevronRight size={19} /></button>
              <button onClick={() => setMenuScreen("collaborators")}><span className="rm-menu-icon"><Wrench size={21} /></span><div><strong>Interface collaborateurs</strong><small>Consignes, documents sans prix et photos chantier</small></div><ChevronRight size={19} /></button>
              <button><span className="rm-menu-icon"><CalendarDays size={21} /></span><div><strong>Agenda</strong><small>Commandes, chantiers et facturations</small></div><ChevronRight size={19} /></button>
              <button><span className="rm-menu-icon"><Building2 size={21} /></span><div><strong>Mon entreprise</strong><small>SIRET, TVA, banque et exercice comptable</small></div><ChevronRight size={19} /></button>
              <button><span className="rm-menu-icon"><Settings size={21} /></span><div><strong>Paramètres</strong><small>Numérotation, logo, couleurs et comptable</small></div><ChevronRight size={19} /></button>
            </section>
          )}

          {tab === "menu" && menuScreen === "clients" && (
            <>
              <div className="rm-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client" /></div>
              <section className="rm-list rm-client-list">
                {clients.filter((client) => !query || `${client.name} ${client.meta}`.toLowerCase().includes(query.toLowerCase())).map((client) => (
                  <button className="rm-client-card" key={client.name}><span className="rm-client-avatar"><CircleUserRound size={22} /></span><div><strong>{client.name}</strong><small>{client.meta}</small><span>{client.phone}</span></div><ChevronRight size={18} /></button>
                ))}
              </section>
              <button className="rm-primary-fab">Nouveau client <Plus size={20} /></button>
            </>
          )}

          {tab === "menu" && menuScreen === "collaborators" && (
            <section className="rm-collab-screen">
              <div className="rm-collab-hero"><span><Wrench size={25} /></span><h2>Mode chantier</h2><p>Une interface simplifiée pour les exécutants, sans prix ni données sensibles.</p></div>
              <button className="rm-work-card"><div><small>CHANTIER EN COURS</small><strong>SCI Bellevue · Hall d’entrée</strong><span>Peinture murs et plafond · 18 m²</span></div><ChevronRight size={20} /></button>
              <button className="rm-work-card"><div><small>À FAIRE DEMAIN</small><strong>Mme Robin · Dégât des eaux</strong><span>Préparation, enduit et remise en peinture</span></div><ChevronRight size={20} /></button>
              <div className="rm-collab-actions"><button>Ajouter des photos</button><button>Signaler une difficulté</button><button>Marquer l’étape terminée</button></div>
            </section>
          )}
        </main>

        <nav className="rm-bottom-nav">
          <button className={tab === "quotes" ? "active" : ""} onClick={() => changeTab("quotes")}><FileText size={21} /><span>Devis</span></button>
          <button className={tab === "invoices" ? "active" : ""} onClick={() => changeTab("invoices")}><ReceiptText size={21} /><span>Factures</span></button>
          <button className={tab === "menu" ? "active" : ""} onClick={() => changeTab("menu")}><LayoutGrid size={21} /><span>Menu</span></button>
        </nav>
      </div>

      {creating && (
        <div className="rm-modal-backdrop">
          <section className="rm-create-sheet">
            <header><button onClick={() => setCreating(null)}><X size={19} /></button><h2>{creating === "quote" ? "Nouveau devis" : "Nouvelle facture"}</h2><span /></header>
            <button className="rm-form-card"><div><small>Client</small><strong>Coordonnées client</strong></div><ChevronRight size={19} /></button>
            <button className="rm-form-card"><div><small>Document</small><strong>{creating === "quote" ? "D-2026-379" : "F-2026-021"}</strong><span>Émission aujourd’hui · échéance modifiable</span></div><ChevronRight size={19} /></button>
            <div className="rm-products-title"><span>Produits et services</span><button><Plus size={20} /></button></div>
            <button className={`rm-voice-button ${listening ? "listening" : ""}`} onClick={() => setListening((value) => !value)}><Mic size={20} />{listening ? "Je vous écoute…" : "Commencer la dictée"}</button>
            <button className="rm-manual-line"><Plus size={17} /> Ajouter une ligne manuellement</button>
            {listening && <div className="rm-transcript"><span>Transcription</span><p>« RSE, franchise, 125 euros TTC. Peinture murale 18 m² à 32 euros le m². »</p><div><Check size={17} /> 2 lignes reconnues · calculs à valider</div></div>}
            <footer><div><small>Total HT</small><strong>{listening ? "689,64 €" : "0,00 €"}</strong><small>TVA : {listening ? "68,96 €" : "0,00 €"}</small></div><div><button className="rm-outline-button">Aperçu</button><button className="rm-save-button">Enregistrer</button></div></footer>
          </section>
        </div>
      )}
    </div>
  );
}
