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
  Mail,
  Menu,
  Mic,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Search,
  Settings,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Section = "dashboard" | "quotes" | "invoices" | "clients" | "calendar" | "settings";
type QuoteStatus = "Brouillon" | "Envoyé" | "Accepté" | "Refusé" | "Expiré";
type InvoiceStatus = "Brouillon" | "Émise" | "Payée" | "En retard";

type Quote = {
  id: string;
  client: string;
  project: string;
  date: string;
  amount: number;
  status: QuoteStatus;
};

type Invoice = {
  id: string;
  client: string;
  due: string;
  amount: number;
  status: InvoiceStatus;
  accountant: boolean;
};

const navItems = [
  { id: "dashboard" as Section, label: "Tableau de bord", icon: LayoutDashboard },
  { id: "quotes" as Section, label: "Devis", icon: FileText },
  { id: "invoices" as Section, label: "Factures", icon: ReceiptText },
  { id: "clients" as Section, label: "Clients", icon: UsersRound },
  { id: "calendar" as Section, label: "Agenda", icon: CalendarDays },
  { id: "settings" as Section, label: "Paramètres", icon: Settings },
];

const quotes: Quote[] = [
  { id: "DEV-2026-042", client: "Cabinet Giraud", project: "Rénovation bureaux — Saint-Étienne", date: "29 juil. 2026", amount: 8460, status: "Envoyé" },
  { id: "DEV-2026-041", client: "Mme & M. Roux", project: "Plafonds et peinture salon", date: "28 juil. 2026", amount: 3180, status: "Accepté" },
  { id: "DEV-2026-040", client: "SCI Bellevue", project: "Remise en état après dégât des eaux", date: "25 juil. 2026", amount: 12780, status: "Brouillon" },
  { id: "DEV-2026-039", client: "Boulangerie Perrin", project: "Peinture laboratoire", date: "22 juil. 2026", amount: 4720, status: "Refusé" },
  { id: "DEV-2026-038", client: "M. Faure", project: "Cage d’escalier", date: "18 juil. 2026", amount: 2650, status: "Expiré" },
];

const invoices: Invoice[] = [
  { id: "FAC-2026-017", client: "Mme & M. Roux", due: "15 août 2026", amount: 1590, status: "Émise", accountant: true },
  { id: "FAC-2026-016", client: "Assurances Loire", due: "31 juil. 2026", amount: 6940, status: "En retard", accountant: true },
  { id: "FAC-2026-015", client: "Cabinet Giraud", due: "28 juil. 2026", amount: 2460, status: "Payée", accountant: true },
  { id: "FAC-2026-014", client: "SCI Bellevue", due: "—", amount: 3250, status: "Brouillon", accountant: false },
];

const clients = [
  { name: "Cabinet Giraud", kind: "Professionnel", legal: "SIRET 892 445 112 00018", details: "2 contacts · 3 adresses", turnover: "18 740 €" },
  { name: "Mme & M. Roux", kind: "Particulier", legal: "Saint-Chamond", details: "2 e-mails · 2 téléphones", turnover: "4 770 €" },
  { name: "SCI Bellevue", kind: "Professionnel", legal: "SIRET 911 302 558 00021", details: "1 contact · 4 chantiers", turnover: "26 180 €" },
  { name: "Boulangerie Perrin", kind: "Professionnel", legal: "SIRET 832 117 964 00032", details: "1 contact · 1 adresse", turnover: "9 240 €" },
];

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function Status({ value }: { value: QuoteStatus | InvoiceStatus }) {
  const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-");
  return <span className={`pc-status pc-status-${slug}`}>{value}</span>;
}

function Kpi({ label, value, note, icon: Icon, strong = false }: { label: string; value: string; note: string; icon: typeof LayoutDashboard; strong?: boolean }) {
  return (
    <article className={`pc-kpi ${strong ? "pc-kpi-strong" : ""}`}>
      <div className="pc-kpi-icon"><Icon size={18} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function VoicePanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"listen" | "review" | "done">("listen");
  return (
    <div className="pc-drawer-backdrop" role="dialog" aria-modal="true">
      <aside className="pc-voice-panel">
        <button className="pc-icon-button pc-close" onClick={onClose} aria-label="Fermer"><X size={19} /></button>
        <div className="pc-voice-header">
          <span>Dictée devis</span>
          <h2>Créer un brouillon sans taper</h2>
          <p>La dictée préremplit le devis. Les prix, quantités et taux restent visibles avant validation.</p>
        </div>
        {step === "listen" && (
          <>
            <button className="pc-mic-button" onClick={() => setStep("review")}><Mic size={28} /></button>
            <div className="pc-listening"><i />Écoute en cours — cliquez pour terminer</div>
            <div className="pc-transcript">« Client Cabinet Giraud. Préparation des murs, 85 mètres carrés à 12 euros. Deux couches de peinture mate à 18 euros le mètre carré. TVA 20 %. Validité deux mois. »</div>
          </>
        )}
        {step === "review" && (
          <div className="pc-review">
            <div className="pc-review-ok"><Check size={16} /> 2 lignes reconnues — aucune donnée n’est envoyée automatiquement</div>
            <div className="pc-review-client"><UserRound size={18} /><div><span>Client</span><strong>Cabinet Giraud</strong></div><button>Modifier</button></div>
            <div className="pc-review-line"><div><strong>Préparation des murs</strong><span>85 m² × 12,00 €</span></div><strong>1 020,00 €</strong></div>
            <div className="pc-review-line"><div><strong>Peinture mate — 2 couches</strong><span>85 m² × 18,00 €</span></div><strong>1 530,00 €</strong></div>
            <div className="pc-review-total"><span>Total</span><strong>3 060,00 €</strong></div>
            <div className="pc-review-actions"><button className="pc-secondary" onClick={() => setStep("listen")}><Mic size={16} /> Corriger à la voix</button><button className="pc-primary" onClick={() => setStep("done")}>Créer le brouillon</button></div>
          </div>
        )}
        {step === "done" && (
          <div className="pc-success"><div><Check size={26} /></div><h3>Brouillon créé</h3><p>DEV-2026-043 est prêt à être relu puis envoyé.</p><button className="pc-primary" onClick={onClose}>Ouvrir le devis</button></div>
        )}
      </aside>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className="pc-heading">
        <div><span>Mercredi 29 juillet</span><h1>Tableau de bord</h1><p>L’essentiel de l’activité, des devis à l’encaissement.</p></div>
        <button className="pc-secondary"><CalendarDays size={16} /> Juillet 2026 <ChevronDown size={15} /></button>
      </div>
      <div className="pc-kpis">
        <Kpi label="Facturé ce mois" value="24 680 €" note="+18 % par rapport à N-1" icon={CircleDollarSign} strong />
        <Kpi label="Encaissé" value="17 740 €" note="6 940 € à recevoir" icon={WalletCards} />
        <Kpi label="Devis en attente" value="5" note="31 420 € de potentiel" icon={Clock3} />
        <Kpi label="Taux d’acceptation" value="68 %" note="+7 points sur 12 mois" icon={FileCheck2} />
      </div>
      <div className="pc-dashboard-grid">
        <section className="pc-panel pc-chart-panel">
          <div className="pc-panel-head"><div><span>Pilotage</span><h2>Chiffre d’affaires</h2></div><button>Voir le détail</button></div>
          <div className="pc-chart-meta"><div><strong>142 380 €</strong><span>Exercice en cours</span></div><div className="pc-legend"><span><i className="pc-dot-current" />2026</span><span><i className="pc-dot-prev" />2025</span></div></div>
          <div className="pc-bars">
            {[48, 61, 53, 73, 69, 88, 78].map((height, index) => <div className="pc-bar-group" key={index}><div className="pc-bar pc-bar-prev" style={{ height: `${height - 12}%` }} /><div className="pc-bar pc-bar-current" style={{ height: `${height}%` }} /><span>{["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil"][index]}</span></div>)}
          </div>
        </section>
        <section className="pc-panel pc-priorities">
          <div className="pc-panel-head"><div><span>À traiter</span><h2>Priorités</h2></div><b>4</b></div>
          <div className="pc-priority pc-priority-danger"><Bell size={17} /><div><strong>Facture en retard</strong><span>FAC-2026-016 · 6 940 €</span></div><button>Relancer</button></div>
          <div className="pc-priority"><FileCheck2 size={17} /><div><strong>Devis accepté à facturer</strong><span>Mme & M. Roux · 3 180 €</span></div><button>Facturer</button></div>
          <div className="pc-priority"><Clock3 size={17} /><div><strong>2 devis sans réponse</strong><span>Depuis plus de 10 jours</span></div><button>Voir</button></div>
          <div className="pc-priority"><Mail size={17} /><div><strong>3 documents prêts</strong><span>En attente d’envoi</span></div><button>Voir</button></div>
        </section>
      </div>
      <section className="pc-panel pc-recent">
        <div className="pc-panel-head"><div><span>Derniers mouvements</span><h2>Activité récente</h2></div><button>Tout afficher</button></div>
        <div className="pc-activity"><i className="pc-activity-ok"><Check size={15} /></i><div><strong>DEV-2026-041 accepté</strong><span>Mme & M. Roux · il y a 22 min</span></div><strong>3 180 €</strong></div>
        <div className="pc-activity"><i><Mail size={15} /></i><div><strong>DEV-2026-042 envoyé</strong><span>Cabinet Giraud · il y a 1 h</span></div><strong>8 460 €</strong></div>
        <div className="pc-activity"><i><WalletCards size={15} /></i><div><strong>Paiement reçu</strong><span>Cabinet Giraud · il y a 3 h</span></div><strong>2 460 €</strong></div>
      </section>
    </>
  );
}

function Quotes() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Tous" | QuoteStatus>("Tous");
  const filtered = useMemo(() => quotes.filter((quote) => (status === "Tous" || quote.status === status) && `${quote.id} ${quote.client} ${quote.project}`.toLowerCase().includes(query.toLowerCase())), [query, status]);
  return (
    <>
      <div className="pc-heading"><div><span>Documents commerciaux</span><h1>Devis</h1><p>Recherche, filtres, statuts et accès rapide à chaque dossier.</p></div><button className="pc-primary"><Plus size={16} /> Nouveau devis</button></div>
      <div className="pc-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client, numéro ou chantier…" /></label><div><SlidersHorizontal size={16} />{(["Tous", "Brouillon", "Envoyé", "Accepté", "Refusé", "Expiré"] as const).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{item}</button>)}</div></div>
      <section className="pc-panel pc-table-panel">
        <div className="pc-table pc-quotes-table"><div className="pc-table-row pc-table-head"><span>Devis</span><span>Client / chantier</span><span>Date</span><span>Montant</span><span>État</span><span /></div>{filtered.map((quote) => <div className="pc-table-row" key={quote.id}><strong>{quote.id}</strong><div><strong>{quote.client}</strong><small>{quote.project}</small></div><span>{quote.date}</span><strong>{euro.format(quote.amount)}</strong><Status value={quote.status} /><button className="pc-icon-button"><MoreHorizontal size={18} /></button></div>)}</div>
        <div className="pc-mobile-list">{filtered.map((quote) => <article key={quote.id}><div><span>{quote.id}</span><Status value={quote.status} /></div><h3>{quote.client}</h3><p>{quote.project}</p><footer><span>{quote.date}</span><strong>{euro.format(quote.amount)}</strong></footer></article>)}</div>
      </section>
    </>
  );
}

function Invoices() {
  const [query, setQuery] = useState("");
  const filtered = invoices.filter((invoice) => `${invoice.id} ${invoice.client}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <div className="pc-heading"><div><span>Suivi des encaissements</span><h1>Factures</h1><p>Émises, payées, en retard et transmises au comptable.</p></div><button className="pc-primary"><Plus size={16} /> Nouvelle facture</button></div>
      <div className="pc-kpis pc-kpis-three"><Kpi label="Émis ce mois" value="24 680 €" note="9 factures" icon={ReceiptText} /><Kpi label="Déjà payé" value="17 740 €" note="71,9 % encaissé" icon={Check} strong /><Kpi label="En retard" value="6 940 €" note="1 facture à relancer" icon={Bell} /></div>
      <div className="pc-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Facture ou client…" /></label><div><SlidersHorizontal size={16} /><button className="active">Toutes</button><button>Émises</button><button>Payées</button><button>En retard</button></div></div>
      <section className="pc-panel pc-table-panel"><div className="pc-table pc-invoices-table"><div className="pc-table-row pc-table-head"><span>Facture</span><span>Client</span><span>Échéance</span><span>Montant</span><span>État</span><span>Comptable</span></div>{filtered.map((invoice) => <div className="pc-table-row" key={invoice.id}><strong>{invoice.id}</strong><strong>{invoice.client}</strong><span>{invoice.due}</span><strong>{euro.format(invoice.amount)}</strong><Status value={invoice.status} /><span className="pc-accountant">{invoice.accountant ? <><Check size={14} /> Envoyée</> : "—"}</span></div>)}</div><div className="pc-mobile-list">{filtered.map((invoice) => <article key={invoice.id}><div><span>{invoice.id}</span><Status value={invoice.status} /></div><h3>{invoice.client}</h3><p>Échéance : {invoice.due}</p><footer><span>{invoice.accountant ? "Comptable informé" : "Brouillon"}</span><strong>{euro.format(invoice.amount)}</strong></footer></article>)}</div></section>
    </>
  );
}

function Clients() {
  return (
    <>
      <div className="pc-heading"><div><span>Répertoire unifié</span><h1>Clients</h1><p>Particuliers et professionnels, avec leurs contacts et adresses.</p></div><button className="pc-primary"><Plus size={16} /> Nouveau client</button></div>
      <div className="pc-toolbar"><label><Search size={17} /><input placeholder="Nom, société, SIRET ou téléphone…" /></label><div><button className="active">Tous</button><button>Professionnels</button><button>Particuliers</button></div></div>
      <div className="pc-client-grid">{clients.map((client) => <article className="pc-client-card" key={client.name}><div className="pc-client-avatar">{client.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</div><div className="pc-client-main"><div><span>{client.kind}</span><h3>{client.name}</h3><p>{client.legal}</p></div><button className="pc-icon-button"><MoreHorizontal size={18} /></button></div><div className="pc-client-meta"><span>{client.details}</span><span>CA cumulé <strong>{client.turnover}</strong></span></div><button className="pc-full-button">Ouvrir la fiche <ChevronRight size={15} /></button></article>)}</div>
    </>
  );
}

function CalendarView() {
  const days = ["Lun. 27", "Mar. 28", "Mer. 29", "Jeu. 30", "Ven. 31"];
  return (
    <><div className="pc-heading"><div><span>Organisation</span><h1>Agenda</h1><p>Chantiers, devis à préparer, facturation et relances.</p></div><button className="pc-primary"><Plus size={16} /> Ajouter</button></div><section className="pc-panel pc-calendar-panel"><div className="pc-calendar-toolbar"><button className="pc-secondary">Semaine du 27 juillet <ChevronDown size={15} /></button><div><button className="active">Semaine</button><button>Mois</button></div></div><div className="pc-week">{days.map((day, index) => <div className={`pc-day ${index === 2 ? "today" : ""}`} key={day}><div className="pc-day-title"><span>{day}</span>{index === 2 && <small>Aujourd’hui</small>}</div>{index === 0 && <><div className="pc-event pc-event-work"><span>08:00</span><strong>Chantier Roux</strong><small>Peinture salon · équipe 1</small></div><div className="pc-event pc-event-invoice"><span>16:30</span><strong>Facturer acompte</strong><small>SCI Bellevue</small></div></>}{index === 1 && <div className="pc-event pc-event-quote"><span>10:00</span><strong>Visite devis</strong><small>Cabinet Giraud</small></div>}{index === 2 && <><div className="pc-event pc-event-work"><span>07:30</span><strong>Sinistre Assurances Loire</strong><small>Reprise plafonds · équipe 2</small></div><div className="pc-event pc-event-alert"><span>17:00</span><strong>Relance facture</strong><small>FAC-2026-016</small></div></>}{index === 3 && <div className="pc-event pc-event-quote"><span>14:00</span><strong>Préparer devis</strong><small>Boulangerie Perrin</small></div>}{index === 4 && <div className="pc-event pc-event-work"><span>08:00</span><strong>Chantier Roux</strong><small>Finitions</small></div>}</div>)}</div></section></>
  );
}

function SettingsView() {
  return (
    <><div className="pc-heading"><div><span>Configuration</span><h1>Paramètres</h1><p>Entreprise, exercice comptable, documents et partage.</p></div><button className="pc-primary"><Check size={16} /> Enregistrer</button></div><div className="pc-settings-grid"><section className="pc-panel pc-setting"><div className="pc-setting-title"><Building2 size={20} /><div><h2>Entreprise</h2><p>Informations légales des documents.</p></div></div><div className="pc-form-grid"><label>Raison sociale<input defaultValue="CHAPET SAS" /></label><label>SIRET<input defaultValue="892 445 112 00018" /></label><label>TVA intracommunautaire<input defaultValue="FR 32 892445112" /></label><label>Téléphone<input defaultValue="04 77 00 00 00" /></label></div></section><section className="pc-panel pc-setting"><div className="pc-setting-title"><CalendarDays size={20} /><div><h2>Exercice comptable</h2><p>Début et fin de période.</p></div></div><div className="pc-form-grid"><label>Premier jour<input type="date" defaultValue="2026-01-01" /></label><label>Dernier jour<input type="date" defaultValue="2026-12-31" /></label></div></section><section className="pc-panel pc-setting"><div className="pc-setting-title"><Mail size={20} /><div><h2>Partage comptable</h2><p>Copie automatique des factures émises.</p></div></div><label className="pc-wide-label">E-mail du cabinet<input defaultValue="comptabilite@cabinet-loire.fr" /></label><label className="pc-toggle"><span><strong>Copie automatique</strong><small>Le client ne voit jamais cette adresse.</small></span><input type="checkbox" defaultChecked /></label></section><section className="pc-panel pc-setting"><div className="pc-setting-title"><SlidersHorizontal size={20} /><div><h2>Documents</h2><p>Logo, couleurs, numérotation et validité.</p></div></div><div className="pc-form-grid"><label>Préfixe devis<input defaultValue="DEV-{année}-" /></label><label>Validité<select defaultValue="60"><option value="30">30 jours</option><option value="60">60 jours</option><option value="90">90 jours</option></select></label></div></section></div></>
  );
}

export default function Prototype() {
  const [section, setSection] = useState<Section>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const current = navItems.find((item) => item.id === section)?.label ?? "Projet Chapet";
  const content = section === "dashboard" ? <Dashboard /> : section === "quotes" ? <Quotes /> : section === "invoices" ? <Invoices /> : section === "clients" ? <Clients /> : section === "calendar" ? <CalendarView /> : <SettingsView />;
  return (
    <div className="pc-shell">
      <aside className={`pc-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="pc-brand"><div>PC</div><span><strong>Projet Chapet</strong><small>Gestion bâtiment</small></span><button className="pc-icon-button pc-menu-close" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
        <div className="pc-company"><span>Entreprise active</span><strong>CHAPET SAS</strong><small>Saint-Étienne · Loire</small></div>
        <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setMenuOpen(false); }}><Icon size={18} /><span>{label}</span>{id === "invoices" && <b>1</b>}</button>)}</nav>
        <div className="pc-sidebar-bottom"><div className="pc-support"><span>Support</span><strong>Une vraie personne vous répond.</strong><button>Contacter l’assistance</button></div><div className="pc-profile"><div>PC</div><span><strong>Philippe Chapet</strong><small>Administrateur</small></span><ChevronDown size={15} /></div></div>
      </aside>
      {menuOpen && <button className="pc-overlay" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />}
      <div className="pc-main">
        <header className="pc-topbar"><div className="pc-mobile-title"><button className="pc-icon-button" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><strong>{current}</strong></div><label className="pc-global-search"><Search size={17} /><input placeholder="Rechercher devis, facture ou client…" /><kbd>⌘ K</kbd></label><div className="pc-top-actions"><button className="pc-icon-button"><Bell size={18} /><i /></button><button className="pc-voice-button" onClick={() => setVoiceOpen(true)}><Mic size={17} /><span>Dictée devis</span></button><button className="pc-primary pc-new-button"><Plus size={16} /><span>Nouveau</span></button></div></header>
        <main className="pc-content">{content}</main>
        <nav className="pc-mobile-nav">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><Icon size={20} /><span>{label === "Tableau de bord" ? "Accueil" : label}</span></button>)}</nav>
        <button className="pc-mobile-mic" onClick={() => setVoiceOpen(true)}><Mic size={23} /></button>
      </div>
      {voiceOpen && <VoicePanel onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}
