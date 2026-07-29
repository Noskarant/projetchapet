"use client";

import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
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
  Sparkles,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Section = "dashboard" | "quotes" | "invoices" | "clients" | "calendar" | "settings";
type QuoteStatus = "Brouillon" | "Envoyé" | "Accepté" | "Refusé" | "Expiré";
type InvoiceStatus = "Émise" | "Payée" | "En retard" | "Brouillon";

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
};

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "quotes", label: "Devis", icon: FileText },
  { id: "invoices", label: "Factures", icon: ReceiptText },
  { id: "clients", label: "Clients", icon: UsersRound },
  { id: "calendar", label: "Agenda", icon: CalendarDays },
  { id: "settings", label: "Paramètres", icon: Settings },
];

const quotes: Quote[] = [
  { id: "DEV-2026-042", client: "Cabinet Giraud", project: "Rénovation bureaux — Saint-Étienne", date: "29 juil. 2026", amount: 8460, status: "Envoyé" },
  { id: "DEV-2026-041", client: "Mme & M. Roux", project: "Plafonds et peinture salon", date: "28 juil. 2026", amount: 3180, status: "Accepté" },
  { id: "DEV-2026-040", client: "SCI Bellevue", project: "Remise en état après dégât des eaux", date: "25 juil. 2026", amount: 12780, status: "Brouillon" },
  { id: "DEV-2026-039", client: "Boulangerie Perrin", project: "Peinture laboratoire", date: "22 juil. 2026", amount: 4720, status: "Refusé" },
  { id: "DEV-2026-038", client: "M. Faure", project: "Cage d’escalier", date: "18 juil. 2026", amount: 2650, status: "Expiré" },
];

const invoices: Invoice[] = [
  { id: "FAC-2026-017", client: "Mme & M. Roux", due: "15 août 2026", amount: 1590, status: "Émise" },
  { id: "FAC-2026-016", client: "Assurances Loire", due: "31 juil. 2026", amount: 6940, status: "En retard" },
  { id: "FAC-2026-015", client: "Cabinet Giraud", due: "28 juil. 2026", amount: 2460, status: "Payée" },
  { id: "FAC-2026-014", client: "SCI Bellevue", due: "—", amount: 3250, status: "Brouillon" },
];

const clients = [
  { name: "Cabinet Giraud", kind: "Professionnel", detail: "SIRET 892 445 112 00018", contact: "2 contacts · 3 adresses", turnover: "18 740 €" },
  { name: "Mme & M. Roux", kind: "Particulier", detail: "Saint-Chamond", contact: "2 e-mails · 2 téléphones", turnover: "4 770 €" },
  { name: "SCI Bellevue", kind: "Professionnel", detail: "SIRET 911 302 558 00021", contact: "1 contact · 4 chantiers", turnover: "26 180 €" },
  { name: "Boulangerie Perrin", kind: "Professionnel", detail: "SIRET 832 117 964 00032", contact: "1 contact · 1 adresse", turnover: "9 240 €" },
];

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function StatusPill({ status }: { status: QuoteStatus | InvoiceStatus }) {
  const className = `status status-${status.toLowerCase().replace(" ", "-").replace("é", "e")}`;
  return <span className={className}>{status}</span>;
}

function StatCard({ label, value, note, icon: Icon, accent = false }: { label: string; value: string; note: string; icon: typeof LayoutDashboard; accent?: boolean }) {
  return (
    <article className={`stat-card ${accent ? "accent-card" : ""}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </article>
  );
}

function VoiceModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"listening" | "review" | "done">("listening");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="voice-modal">
        <button className="icon-button close-button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        <div className="voice-head">
          <span className="eyebrow"><Sparkles size={14} /> Assistant devis</span>
          <h2>Créez un devis sans taper</h2>
          <p>Dictez naturellement. Atelio structure les lignes, les quantités et les taux avant validation.</p>
        </div>

        {step === "listening" && (
          <>
            <button className="mic-orb" onClick={() => setStep("review")} aria-label="Simuler la dictée"><Mic size={34} /></button>
            <p className="listening-label"><span /> Écoute en cours… cliquez pour terminer</p>
            <div className="transcript">« Client Cabinet Giraud. Préparation des murs, 85 mètres carrés à 12 euros HT. Deux couches de peinture mate à 18 euros le mètre carré. TVA 20 %. Validité deux mois. »</div>
          </>
        )}

        {step === "review" && (
          <div className="voice-review">
            <div className="review-banner"><Check size={17} /> 2 prestations reconnues — rien n’est envoyé sans votre validation</div>
            <div className="review-client"><UserRound size={18} /><div><span>Client détecté</span><strong>Cabinet Giraud</strong></div><button>Modifier</button></div>
            <div className="line-item"><div><strong>Préparation des murs</strong><span>85 m² × 12,00 €</span></div><strong>1 020,00 €</strong></div>
            <div className="line-item"><div><strong>Peinture mate — 2 couches</strong><span>85 m² × 18,00 €</span></div><strong>1 530,00 €</strong></div>
            <div className="review-total"><span>Total HT</span><strong>2 550,00 €</strong><span>TVA 20 %</span><strong>510,00 €</strong><span>Total TTC</span><strong>3 060,00 €</strong></div>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setStep("listening")}><Mic size={16} /> Corriger à la voix</button><button className="primary-button" onClick={() => setStep("done")}>Créer le brouillon</button></div>
          </div>
        )}

        {step === "done" && (
          <div className="success-state"><div><Check size={30} /></div><h3>Devis créé en brouillon</h3><p>DEV-2026-043 est prêt à être relu, personnalisé puis envoyé.</p><button className="primary-button" onClick={onClose}>Ouvrir le devis</button></div>
        )}
      </section>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Mercredi 29 juillet</span><h1>Bonjour Philippe</h1><p>Voici l’essentiel de votre activité, sans fouiller dans les menus.</p></div>
        <button className="date-button"><CalendarDays size={17} /> Juillet 2026 <ChevronDown size={15} /></button>
      </div>

      <div className="stats-grid">
        <StatCard label="Facturé ce mois" value="24 680 €" note="+18 % par rapport à N-1" icon={CircleDollarSign} accent />
        <StatCard label="Encaissé" value="17 740 €" note="6 940 € encore à recevoir" icon={WalletCards} />
        <StatCard label="Devis en attente" value="5" note="31 420 € de potentiel" icon={Clock3} />
        <StatCard label="Taux d’acceptation" value="68 %" note="+7 points sur 12 mois" icon={TrendingUp} />
      </div>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-head"><div><span className="eyebrow">Pilotage</span><h2>Chiffre d’affaires</h2></div><button className="ghost-button">Voir le détail</button></div>
          <div className="chart-head"><div><strong>142 380 €</strong><span>sur l’exercice en cours</span></div><div className="legend"><span><i className="dot current" />2026</span><span><i className="dot previous" />2025</span></div></div>
          <div className="bar-chart" aria-label="Comparaison du chiffre d’affaires 2025 et 2026">
            {[48, 61, 53, 73, 69, 88, 78].map((height, index) => <div className="bar-group" key={index}><div className="bar previous-bar" style={{ height: `${height - 13}%` }} /><div className="bar current-bar" style={{ height: `${height}%` }} /><span>{["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil"][index]}</span></div>)}
          </div>
        </section>

        <section className="panel priority-panel">
          <div className="panel-head"><div><span className="eyebrow">À traiter</span><h2>Priorités du jour</h2></div><span className="count-badge">4</span></div>
          <div className="priority-list">
            <div className="priority-item urgent"><span className="priority-icon"><Bell size={17} /></span><div><strong>Facture FAC-2026-016 en retard</strong><span>6 940 € · échéance dépassée de 4 jours</span></div><button>Relancer</button></div>
            <div className="priority-item"><span className="priority-icon"><FileCheck2 size={17} /></span><div><strong>Devis accepté à transformer</strong><span>Mme & M. Roux · 3 180 €</span></div><button>Facturer</button></div>
            <div className="priority-item"><span className="priority-icon"><Clock3 size={17} /></span><div><strong>2 devis sans réponse</strong><span>Depuis plus de 10 jours</span></div><button>Voir</button></div>
            <div className="priority-item"><span className="priority-icon"><Mail size={17} /></span><div><strong>3 documents à envoyer</strong><span>Prêts et enregistrés en brouillon</span></div><button>Voir</button></div>
          </div>
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-head"><div><span className="eyebrow">Derniers mouvements</span><h2>Activité récente</h2></div><button className="ghost-button">Tout afficher</button></div>
        <div className="activity-row"><span className="activity-icon green"><Check size={16} /></span><div><strong>Devis DEV-2026-041 accepté</strong><span>Mme & M. Roux · il y a 22 min</span></div><strong>3 180 €</strong></div>
        <div className="activity-row"><span className="activity-icon beige"><Mail size={16} /></span><div><strong>Devis DEV-2026-042 envoyé</strong><span>Cabinet Giraud · il y a 1 h</span></div><strong>8 460 €</strong></div>
        <div className="activity-row"><span className="activity-icon blue"><WalletCards size={16} /></span><div><strong>Paiement reçu</strong><span>Cabinet Giraud · il y a 3 h</span></div><strong>2 460 €</strong></div>
      </section>
    </>
  );
}

function Quotes() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Tous" | QuoteStatus>("Tous");
  const filtered = useMemo(
    () => quotes.filter((quote) => (status === "Tous" || quote.status === status) && `${quote.id} ${quote.client} ${quote.project}`.toLowerCase().includes(query.toLowerCase())),
    [query, status],
  );

  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Documents commerciaux</span><h1>Devis</h1><p>Recherchez, filtrez et changez un statut sans perdre le fil.</p></div><button className="primary-button"><Plus size={17} /> Nouveau devis</button></div>
      <div className="toolbar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par client, numéro ou chantier…" /></label><div className="filter-row"><SlidersHorizontal size={17} />{(["Tous", "Brouillon", "Envoyé", "Accepté", "Refusé", "Expiré"] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={status === item ? "active-filter" : ""}>{item}</button>)}</div></div>
      <section className="panel table-panel">
        <div className="desktop-table">
          <div className="table-row table-header"><span>Devis</span><span>Client / chantier</span><span>Date</span><span>Montant</span><span>État</span><span /></div>
          {filtered.map((quote) => <div className="table-row" key={quote.id}><strong>{quote.id}</strong><div><strong>{quote.client}</strong><small>{quote.project}</small></div><span>{quote.date}</span><strong>{euro.format(quote.amount)}</strong><StatusPill status={quote.status} /><button className="icon-button"><MoreHorizontal size={18} /></button></div>)}
        </div>
        <div className="mobile-card-list">{filtered.map((quote) => <article className="document-card" key={quote.id}><div className="document-top"><span>{quote.id}</span><StatusPill status={quote.status} /></div><h3>{quote.client}</h3><p>{quote.project}</p><div className="document-foot"><span>{quote.date}</span><strong>{euro.format(quote.amount)}</strong></div></article>)}</div>
        {filtered.length === 0 && <div className="empty-state"><Search size={24} /><strong>Aucun devis trouvé</strong><span>Essayez un autre mot-clé ou retirez un filtre.</span></div>}
      </section>
    </>
  );
}

function Invoices() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Suivi des encaissements</span><h1>Factures</h1><p>Identifiez immédiatement ce qui est payé, dû ou en retard.</p></div><button className="primary-button"><Plus size={17} /> Nouvelle facture</button></div>
      <div className="stats-grid compact-stats"><StatCard label="Émis ce mois" value="24 680 €" note="9 factures" icon={ReceiptText} /><StatCard label="Déjà payé" value="17 740 €" note="71,9 % encaissé" icon={Check} accent /><StatCard label="En retard" value="6 940 €" note="1 facture à relancer" icon={Bell} /></div>
      <div className="toolbar"><label className="search-field"><Search size={18} /><input placeholder="Rechercher une facture ou un client…" /></label><div className="filter-row"><SlidersHorizontal size={17} /><button className="active-filter">Toutes</button><button>Émises</button><button>Payées</button><button>En retard</button></div></div>
      <section className="panel table-panel">
        <div className="desktop-table"><div className="table-row invoice-row table-header"><span>Facture</span><span>Client</span><span>Échéance</span><span>Montant</span><span>État</span><span /></div>{invoices.map((invoice) => <div className="table-row invoice-row" key={invoice.id}><strong>{invoice.id}</strong><strong>{invoice.client}</strong><span>{invoice.due}</span><strong>{euro.format(invoice.amount)}</strong><StatusPill status={invoice.status} /><button className="icon-button"><MoreHorizontal size={18} /></button></div>)}</div>
        <div className="mobile-card-list">{invoices.map((invoice) => <article className="document-card" key={invoice.id}><div className="document-top"><span>{invoice.id}</span><StatusPill status={invoice.status} /></div><h3>{invoice.client}</h3><p>Échéance : {invoice.due}</p><div className="document-foot"><button className="text-action">Marquer payée</button><strong>{euro.format(invoice.amount)}</strong></div></article>)}</div>
      </section>
    </>
  );
}

function Clients() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Répertoire unifié</span><h1>Clients</h1><p>Particuliers et professionnels, avec tous leurs contacts et adresses.</p></div><button className="primary-button"><Plus size={17} /> Nouveau client</button></div>
      <div className="toolbar"><label className="search-field"><Search size={18} /><input placeholder="Nom, société, SIRET, téléphone…" /></label><div className="filter-row"><button className="active-filter">Tous</button><button>Professionnels</button><button>Particuliers</button></div></div>
      <div className="client-grid">{clients.map((client) => <article className="client-card" key={client.name}><div className="client-avatar">{client.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</div><div className="client-main"><div><span className="client-kind">{client.kind}</span><h3>{client.name}</h3><p>{client.detail}</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="client-meta"><span>{client.contact}</span><span>CA cumulé <strong>{client.turnover}</strong></span></div><button className="full-button">Ouvrir la fiche</button></article>)}</div>
    </>
  );
}

function CalendarView() {
  const days = ["Lun. 27", "Mar. 28", "Mer. 29", "Jeu. 30", "Ven. 31"];
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Organisation de l’équipe</span><h1>Agenda</h1><p>Chantiers, devis à préparer, facturations et relances au même endroit.</p></div><button className="primary-button"><Plus size={17} /> Ajouter</button></div>
      <section className="panel calendar-panel"><div className="calendar-toolbar"><button className="date-button">Semaine du 27 juillet <ChevronDown size={15} /></button><div><button className="active-filter">Semaine</button><button>Mois</button></div></div><div className="week-grid">{days.map((day, index) => <div className={`day-column ${index === 2 ? "today" : ""}`} key={day}><div className="day-title"><span>{day}</span>{index === 2 && <small>Aujourd’hui</small>}</div>{index === 0 && <><div className="calendar-event work"><span>08:00</span><strong>Chantier Roux</strong><small>Peinture salon · équipe 1</small></div><div className="calendar-event invoice"><span>16:30</span><strong>Facturer acompte</strong><small>SCI Bellevue</small></div></>}{index === 1 && <div className="calendar-event quote"><span>10:00</span><strong>Visite devis</strong><small>Cabinet Giraud</small></div>}{index === 2 && <><div className="calendar-event work"><span>07:30</span><strong>Sinistre Assurances Loire</strong><small>Reprise plafonds · équipe 2</small></div><div className="calendar-event reminder"><span>17:00</span><strong>Relance facture</strong><small>FAC-2026-016</small></div></>}{index === 3 && <div className="calendar-event quote"><span>14:00</span><strong>Préparer devis</strong><small>Boulangerie Perrin</small></div>}{index === 4 && <div className="calendar-event work"><span>08:00</span><strong>Chantier Roux</strong><small>Finitions</small></div>}</div>)}</div></section>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Configuration</span><h1>Paramètres</h1><p>Votre entreprise, vos documents et vos automatisations.</p></div><button className="primary-button"><Check size={17} /> Enregistrer</button></div>
      <div className="settings-grid">
        <section className="panel settings-section"><div className="settings-title"><BriefcaseBusiness size={20} /><div><h2>Entreprise</h2><p>Informations légales utilisées sur les documents.</p></div></div><div className="form-grid"><label>Raison sociale<input defaultValue="CHAPET SAS" /></label><label>SIRET<input defaultValue="892 445 112 00018" /></label><label>TVA intracommunautaire<input defaultValue="FR 32 892445112" /></label><label>Téléphone<input defaultValue="04 77 00 00 00" /></label></div></section>
        <section className="panel settings-section"><div className="settings-title"><CalendarDays size={20} /><div><h2>Exercice comptable</h2><p>Pour comparer correctement vos périodes.</p></div></div><div className="form-grid"><label>Premier jour<input type="date" defaultValue="2026-01-01" /></label><label>Dernier jour<input type="date" defaultValue="2026-12-31" /></label></div></section>
        <section className="panel settings-section"><div className="settings-title"><Mail size={20} /><div><h2>Partage comptable</h2><p>Envoyer automatiquement chaque facture émise.</p></div></div><label className="wide-label">E-mail du cabinet comptable<input type="email" defaultValue="comptabilite@cabinet-loire.fr" /></label><label className="toggle-row"><span><strong>Copie automatique</strong><small>Le client ne voit jamais cette adresse.</small></span><input type="checkbox" defaultChecked /></label></section>
        <section className="panel settings-section"><div className="settings-title"><SlidersHorizontal size={20} /><div><h2>Documents</h2><p>Logo, couleurs, numérotation et validité.</p></div></div><div className="form-grid"><label>Préfixe devis<input defaultValue="DEV-{année}-" /></label><label>Validité par défaut<select defaultValue="60"><option value="30">30 jours</option><option value="60">60 jours</option><option value="90">90 jours</option></select></label><label>Couleur principale<input type="color" defaultValue="#1f7a5a" /></label><label>Logo<button className="upload-button">Choisir un fichier</button></label></div></section>
      </div>
    </>
  );
}

export default function HomePage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const currentLabel = navItems.find((item) => item.id === section)?.label ?? "Atelio";
  const content = section === "dashboard" ? <Dashboard /> : section === "quotes" ? <Quotes /> : section === "invoices" ? <Invoices /> : section === "clients" ? <Clients /> : section === "calendar" ? <CalendarView /> : <SettingsView />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark">A</div><div><strong>Atelio</strong><span>Gestion artisan</span></div></div>
        <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active-nav" : ""} onClick={() => { setSection(id); setMobileMenu(false); }}><Icon size={19} /><span>{label}</span>{id === "invoices" && <small>1</small>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="support-card"><span>Besoin d’aide ?</span><strong>Parlez à une vraie personne.</strong><button>Contacter le support</button></div><div className="profile-card"><div className="avatar">PC</div><div><strong>Philippe Chapet</strong><span>Administrateur</span></div><ChevronDown size={16} /></div></div>
      </aside>

      {mobileMenu && <button className="menu-overlay" aria-label="Fermer le menu" onClick={() => setMobileMenu(false)} />}

      <div className="main-shell">
        <header className="topbar"><div className="mobile-title"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><strong>{currentLabel}</strong></div><label className="global-search"><Search size={17} /><input placeholder="Rechercher partout…" /><kbd>⌘ K</kbd></label><div className="top-actions"><button className="icon-button"><Bell size={19} /><span className="notification-dot" /></button><button className="voice-button" onClick={() => setVoiceOpen(true)}><Mic size={18} /><span>Créer à la voix</span></button></div></header>
        <main className="content">{content}</main>
        <nav className="mobile-bottom-nav">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active-mobile-nav" : ""} onClick={() => setSection(id)}><Icon size={20} /><span>{label === "Tableau de bord" ? "Accueil" : label}</span></button>)}</nav>
        <button className="mobile-voice-fab" onClick={() => setVoiceOpen(true)} aria-label="Créer à la voix"><Mic size={24} /></button>
      </div>

      {voiceOpen && <VoiceModal onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}
