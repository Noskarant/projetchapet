"use client";

import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  FileSignature,
  FileText,
  HardHat,
  History,
  Import,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Mic,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { ArtisanPhoto, ForgeoBrand, ManufeoLockup } from "./forgeo-public-ui";

type Props = { onLogin: () => void; onSignup: () => void };

const capabilityGroups = [
  {
    label: "ASSISTANT IA",
    title: "Il prépare le travail, pas seulement le texte.",
    items: [
      {
        icon: Mic,
        title: "Vocal multi-actions",
        text: "Une même demande peut préparer un client, un devis, une note chantier ou une action à planifier.",
      },
      {
        icon: Sparkles,
        title: "Copilote métier",
        text: "Décrivez un chantier en vrac : MANUFEO structure les prestations, relève les zones floues et prépare une proposition.",
      },
      {
        icon: ClipboardCheck,
        title: "Validation avant action",
        text: "Vous voyez ce qui va être créé ou modifié avant exécution. Les actions sensibles demandent une confirmation explicite.",
      },
      {
        icon: History,
        title: "Traçabilité des actions",
        text: "Les propositions IA, confirmations et exécutions sont historisées pour garder un fonctionnement contrôlable.",
      },
    ],
  },
  {
    label: "GESTION COMMERCIALE",
    title: "Du premier contact au suivi du règlement.",
    items: [
      {
        icon: UsersRound,
        title: "Clients et contacts",
        text: "Centralisez les coordonnées, informations société et historique utile à votre activité.",
      },
      {
        icon: FileText,
        title: "Devis",
        text: "Préparez, relisez et transformez vos chiffrages avec des lignes structurées et des contrôles avant envoi.",
      },
      {
        icon: Receipt,
        title: "Factures et paiements",
        text: "Suivez vos factures, leurs échéances et les règlements enregistrés sans perdre le fil client.",
      },
      {
        icon: BarChart3,
        title: "Rentabilité",
        text: "Mettez en regard prix, coûts et temps de travail pour repérer les chantiers qui fragilisent votre marge.",
      },
    ],
  },
  {
    label: "CHANTIERS & ÉQUIPE",
    title: "Le terrain et l’administratif dans le même espace.",
    items: [
      {
        icon: HardHat,
        title: "Suivi des chantiers",
        text: "Retrouvez les informations opérationnelles, notes et état d’avancement sans multiplier les outils.",
      },
      {
        icon: CalendarDays,
        title: "Agenda et actions",
        text: "Préparez les prochaines étapes et gardez les tâches liées à votre activité dans le même flux de travail.",
      },
      {
        icon: UsersRound,
        title: "Équipe et rôles",
        text: "Invitez vos collaborateurs et adaptez les accès selon leur rôle dans l’entreprise.",
      },
      {
        icon: Package,
        title: "Commandes fournisseurs",
        text: "Préparez et validez les commandes avec un circuit de confirmation avant envoi.",
      },
      {
        icon: FileSignature,
        title: "Signature de documents",
        text: "Conservez une trace simple des validations et signatures liées à vos documents commerciaux.",
      },
      {
        icon: Mail,
        title: "Actions sensibles préparées",
        text: "MANUFEO peut préparer des actions et brouillons, mais ne les envoie pas silencieusement à votre place.",
      },
    ],
  },
];

function AssistantPreview() {
  return (
    <div className="fp-ai-preview" aria-label="Aperçu illustratif de l’assistant MANUFEO">
      <div className="fp-ai-preview-head">
        <span className="fp-ai-orb">
          <Sparkles aria-hidden="true" />
        </span>
        <div>
          <small>ASSISTANT MANUFEO</small>
          <strong>Demande comprise</strong>
        </div>
        <span className="fp-ai-ready"><CircleCheck /> Prêt</span>
      </div>
      <blockquote>
        « Crée Martin Peinture, prépare son devis et note qu’il faut commander la peinture. »
      </blockquote>
      <div className="fp-ai-actions">
        <div>
          <span><UsersRound /></span>
          <p><b>Client Martin Peinture</b><small>Fiche prête à créer</small></p>
          <CircleCheck className="done" />
        </div>
        <div>
          <span><FileText /></span>
          <p><b>Devis</b><small>Brouillon préparé</small></p>
          <CircleCheck className="done" />
        </div>
        <div>
          <span><Package /></span>
          <p><b>Commande fournisseur</b><small>Confirmation requise</small></p>
          <LockKeyhole className="locked" />
        </div>
      </div>
      <div className="fp-ai-preview-foot">
        <ShieldCheck /> Rien de sensible n’est envoyé sans votre validation.
      </div>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="fp-product-preview" aria-label="Aperçu illustratif du pilotage MANUFEO">
      <aside>
        <ForgeoBrand compact />
        <div>
          <span><LayoutDashboard /> Tableau de bord</span>
          <span><FileText /> Devis</span>
          <span><Receipt /> Factures</span>
          <span className="active"><HardHat /> Chantiers</span>
          <span><UsersRound /> Clients</span>
        </div>
        <span><Settings /> Paramètres</span>
      </aside>
      <div className="fp-product-preview-main">
        <small>PILOTAGE DU CHANTIER</small>
        <h3>Rénovation cuisine</h3>
        <div className="fp-product-stat-grid">
          <div><small>ÉTAT</small><b>En cours</b></div>
          <div><small>RENTABILITÉ</small><b>À contrôler</b></div>
        </div>
        <div className="fp-product-tasks">
          <p><CircleCheck /> Devis accepté</p>
          <p><CircleCheck /> Acompte enregistré</p>
          <p><span /> Commande peinture à valider</p>
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <article className="fp-workflow-step">
      <span>{index}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

export default function ForgeoPublicEntry({ onLogin, onSignup }: Props) {
  return (
    <main className="fp-page fp-page-v2" id="accueil">
      <header className="fp-header fp-header-v2">
        <a className="fp-header-brand" href="#accueil" aria-label="MANUFEO, accueil">
          <ForgeoBrand />
        </a>
        <nav className="fp-nav fp-nav-v2" aria-label="Navigation principale">
          <a href="#produit">Le produit</a>
          <a href="#capacites">Capacités</a>
          <a href="#migration">Migration</a>
          <a href="#tarifs">Tarifs</a>
        </nav>
        <div className="fp-header-actions fp-header-actions-v2">
          <button className="fp-login fp-login-v2" onClick={onLogin}>
            Se connecter
          </button>
          <button className="fp-primary fp-primary-v2" onClick={onSignup}>
            Créer mon espace <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="fp-hero fp-hero-v2">
        <div className="fp-hero-copy">
          <span className="fp-eyebrow">L’ASSISTANT MÉTIER DES ARTISANS DU BÂTIMENT</span>
          <h1>
            Votre entreprise avance.
            <br />
            <em>MANUFEO prépare le reste.</em>
          </h1>
          <p>
            Parlez-lui d’un client, d’un chantier ou d’une tâche : MANUFEO comprend,
            structure et prépare les actions. Vous gardez la validation avant exécution.
          </p>
          <div className="fp-hero-actions">
            <button className="fp-primary fp-primary-v2" onClick={onSignup}>
              Créer mon espace <ArrowRight aria-hidden="true" />
            </button>
            <a className="fp-secondary fp-secondary-v2" href="#capacites">
              Voir tout ce qu’il sait faire
            </a>
          </div>
          <div className="fp-hero-trust" aria-label="Principes MANUFEO">
            <span><ShieldCheck /> Validation humaine</span>
            <span><LockKeyhole /> Données par entreprise</span>
            <span><LayoutDashboard /> Bureau + terrain</span>
          </div>
        </div>
        <div className="fp-hero-visual fp-hero-visual-v2">
          <div className="fp-hero-photo">
            <ArtisanPhoto priority />
            <div className="fp-hero-photo-shade" />
          </div>
          <AssistantPreview />
          <div className="fp-hero-mini-card">
            <Sparkles />
            <div><small>COPILOTE MÉTIER</small><b>Les oublis potentiels remontent avant le devis.</b></div>
          </div>
        </div>
      </section>

      <section className="fp-value-strip" aria-label="Valeur de MANUFEO">
        <article><b>1 demande</b><span>peut préparer plusieurs actions</span></article>
        <article><b>Devis → chantier</b><span>le contexte reste au même endroit</span></article>
        <article><b>IA contrôlée</b><span>vous vérifiez avant exécution</span></article>
        <article><b>Migration guidée</b><span>pour ne pas repartir de zéro</span></article>
      </section>

      <section className="fp-product-story" id="produit">
        <div className="fp-section-heading fp-section-heading-wide">
          <span className="fp-eyebrow">PLUS QU’UN LOGICIEL DE DEVIS</span>
          <h2>Une couche d’action sur toute votre entreprise.</h2>
          <p>
            MANUFEO n’est pas conçu pour vous faire apprendre un nouvel ERP. Vous exprimez
            ce que vous voulez faire, il prépare le travail dans le bon contexte, puis vous décidez.
          </p>
        </div>
        <div className="fp-command-demo">
          <div className="fp-command-copy">
            <span className="fp-command-label"><Mic /> UNE PHRASE, PLUSIEURS OPÉRATIONS</span>
            <blockquote>
              « Crée Dupont comme client, prépare son devis, ajoute la visite de mardi et note qu’il faut commander les fournitures. »
            </blockquote>
            <div className="fp-command-result">
              <span><Check /> Client préparé</span>
              <span><Check /> Devis en brouillon</span>
              <span><Check /> Action à planifier</span>
              <span><Check /> Commande à confirmer</span>
            </div>
          </div>
          <div className="fp-command-workflow">
            <WorkflowStep index="01" title="Vous parlez" text="Une demande naturelle, au bureau ou sur le terrain." />
            <WorkflowStep index="02" title="MANUFEO comprend" text="Le contexte est découpé en actions métier cohérentes." />
            <WorkflowStep index="03" title="Il prépare" text="Clients, brouillons, notes et actions sont prévisualisés." />
            <WorkflowStep index="04" title="Vous validez" text="Les opérations sensibles restent bloquées jusqu’à votre accord." />
          </div>
        </div>
      </section>

      <section className="fp-capabilities" id="capacites">
        <div className="fp-section-heading fp-section-heading-wide">
          <span className="fp-eyebrow">CE QUE MANUFEO SAIT DÉJÀ FAIRE</span>
          <h2>Un seul outil, de la demande client jusqu’au suivi du chantier.</h2>
          <p>
            L’IA n’est qu’une interface. Derrière, MANUFEO réunit les briques opérationnelles
            dont une entreprise artisanale a besoin pour travailler sans ressaisie permanente.
          </p>
        </div>
        <div className="fp-capability-groups">
          {capabilityGroups.map((group) => (
            <section className="fp-capability-group" key={group.label}>
              <header>
                <small>{group.label}</small>
                <h3>{group.title}</h3>
              </header>
              <div className="fp-capability-grid">
                {group.items.map(({ icon: Icon, title, text }) => (
                  <article key={title}>
                    <span className="fp-capability-icon"><Icon aria-hidden="true" /></span>
                    <h4>{title}</h4>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="fp-copilot" id="copilote">
        <div className="fp-copilot-copy">
          <span className="fp-eyebrow">COPILOTE MÉTIER</span>
          <h2>Il ne remplit pas juste des cases. Il challenge le chantier.</h2>
          <p>
            Décrivez le besoin avec vos mots. Le copilote structure ce qu’il a compris,
            propose les prestations et met en évidence ce qui mérite votre attention avant chiffrage.
          </p>
          <div className="fp-check-list">
            <span><CircleCheck /> Prestations structurées à partir du chantier</span>
            <span><CircleCheck /> Hypothèses et informations manquantes rendues visibles</span>
            <span><CircleCheck /> Postes potentiellement oubliés signalés</span>
            <span><CircleCheck /> Coûts, temps et marge remis dans la décision</span>
            <span><CircleCheck /> Brouillon de devis uniquement après votre revue</span>
          </div>
        </div>
        <div className="fp-copilot-card">
          <div className="fp-copilot-card-head">
            <span><Sparkles /></span>
            <div><small>COPILOTE MÉTIER</small><strong>Analyse du chantier</strong></div>
            <span className="fp-copilot-confidence">À vérifier</span>
          </div>
          <div className="fp-copilot-understood">
            <small>CE QUI A ÉTÉ COMPRIS</small>
            <p>Préparation du support, ratissage, mise en peinture et finitions.</p>
          </div>
          <div className="fp-copilot-alerts">
            <article><span>01</span><div><b>Oubli potentiel</b><p>Protection et préparation du chantier à confirmer.</p></div></article>
            <article><span>02</span><div><b>Rentabilité</b><p>Temps de main-d’œuvre et marge à contrôler avant validation.</p></div></article>
          </div>
          <button type="button" tabIndex={-1}>Préparer le brouillon <ChevronRight /></button>
          <small className="fp-copilot-disclaimer"><ShieldCheck /> Vérification humaine obligatoire avant envoi.</small>
        </div>
      </section>

      <section className="fp-migration" id="migration">
        <div className="fp-migration-visual">
          <div className="fp-migration-card">
            <span className="fp-migration-icon"><Import /></span>
            <small>CENTRE D’IMPORT</small>
            <h3>Vos données ne restent pas prisonnières de l’ancien outil.</h3>
            <div className="fp-source-tags">
              <span>Tolteck</span><span>Obat</span><span>Costructor</span><span>EBP</span><span>CSV</span>
            </div>
            <div className="fp-import-progress">
              <span><i style={{ width: "78%" }} /></span>
              <p><b>Aperçu avant import</b><small>Mapping, erreurs et doublons visibles avant écriture.</small></p>
            </div>
          </div>
        </div>
        <div className="fp-migration-copy">
          <span className="fp-eyebrow">CHANGEZ D’OUTIL SANS REPARTIR DE ZÉRO</span>
          <h2>Une migration lisible, contrôlée et réversible.</h2>
          <p>
            Importez aujourd’hui vos clients et votre catalogue depuis un CSV issu de Tolteck,
            Obat, Costructor, EBP ou d’un export générique. MANUFEO prépare le mapping avant toute écriture.
          </p>
          <div className="fp-check-list">
            <span><CircleCheck /> Colonnes détectées et mapping modifiable</span>
            <span><CircleCheck /> Lignes invalides et doublons signalés</span>
            <span><CircleCheck /> Confirmation explicite avant import réel</span>
            <span><CircleCheck /> Historique et rollback protégé</span>
          </div>
        </div>
      </section>

      <section className="fp-safety">
        <div>
          <span className="fp-eyebrow">IA SOUS CONTRÔLE</span>
          <h2>L’assistant propose. Votre entreprise décide.</h2>
        </div>
        <div className="fp-safety-grid">
          <article><ShieldCheck /><h3>Revue humaine</h3><p>Chaque action préparée peut être relue avant exécution.</p></article>
          <article><LockKeyhole /><h3>Confirmation sensible</h3><p>Facture, paiement, commande ou e-mail ne passent pas silencieusement.</p></article>
          <article><History /><h3>Audit</h3><p>Les actions IA sont traçables pour comprendre ce qui a été préparé et exécuté.</p></article>
        </div>
      </section>

      <section className="fp-pricing fp-pricing-v2" id="tarifs">
        <div className="fp-pricing-copy">
          <span className="fp-eyebrow">UNE OFFRE POUR PILOTER L’ACTIVITÉ</span>
          <h2>99 € pour remplacer des tâches, pas simplement ajouter un logiciel.</h2>
          <p>
            Pensé pour les entreprises artisanales qui font régulièrement devis, chantiers,
            facturation et suivi — et veulent réduire la ressaisie administrative.
          </p>
          <div className="fp-price-includes">
            <span><Check /> Assistant vocal multi-actions</span>
            <span><Check /> Copilote métier et rentabilité</span>
            <span><Check /> Gestion commerciale, chantier et équipe</span>
            <span><Check /> Centre d’import clients et catalogue</span>
          </div>
        </div>
        <div className="fp-price-card">
          <small>MANUFEO</small>
          <p><strong>99 €</strong><span>HT / mois</span></p>
          <button className="fp-primary fp-primary-v2" onClick={onSignup}>
            Créer mon espace <ArrowRight aria-hidden="true" />
          </button>
          <button className="fp-price-login" onClick={onLogin}>Déjà client ? Se connecter</button>
        </div>
      </section>

      <section className="fp-final-cta">
        <div>
          <span className="fp-eyebrow">MANUFEO</span>
          <h2>Moins d’administratif à piloter. Plus de décisions utiles à prendre.</h2>
          <p>Votre activité reste la vôtre. MANUFEO prépare le travail autour.</p>
        </div>
        <button className="fp-primary fp-primary-v2" onClick={onSignup}>
          Créer mon espace <ArrowRight aria-hidden="true" />
        </button>
      </section>

      <footer className="fp-footer fp-footer-v2">
        <div className="fp-footer-brand">
          <a className="fp-footer-lockup" href="#accueil" aria-label="MANUFEO, accueil">
            <ManufeoLockup />
          </a>
          <p>L’assistant métier des artisans du bâtiment.</p>
        </div>
        <div className="fp-footer-meta">
          <nav className="fp-footer-links" aria-label="Informations légales">
            <a href="/mentions-legales">Mentions légales</a>
            <a href="/politique-confidentialite">Confidentialité</a>
            <a href="/cgv">CGV</a>
            <a href="mailto:noe.anterieux@importmarginguard.fr">Contact</a>
          </nav>
          <p>© 2026 MANUFEO. Tous droits réservés.</p>
        </div>
        <button className="fp-login fp-footer-login" onClick={onLogin}>Se connecter</button>
      </footer>
    </main>
  );
}
