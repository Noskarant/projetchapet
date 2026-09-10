"use client";

import {
  FileText,
  HardHat,
  UsersRound,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Check,
  ShieldCheck,
  Mic,
} from "lucide-react";
import { ArtisanPhoto, ForgeoBrand } from "./forgeo-public-ui";

type Props = { onLogin: () => void; onSignup: () => void };

function ProjectPreview() {
  return (
    <div
      className="fp-project-preview"
      aria-label="Aperçu illustratif des chantiers FORGEO"
    >
      <aside>
        <ForgeoBrand compact />
        <div>
          <span>
            <LayoutDashboard /> Tableau de bord
          </span>
          <span>
            <FileText /> Devis
          </span>
          <span>
            <FileText /> Factures
          </span>
          <span className="active">
            <HardHat /> Chantiers
          </span>
          <span>
            <UsersRound /> Clients
          </span>
          <span>
            <UsersRound /> Équipe
          </span>
        </div>
        <span>
          <Settings /> Paramètres
        </span>
      </aside>
      <div className="fp-project-preview-main">
        <small>Aperçu du logiciel · Données d’exemple</small>
        <h3>Mes chantiers</h3>
        {[
          {
            name: "Rénovation cuisine",
            place: "Lyon (69)",
            status: "En cours",
            tone: "blue",
          },
          {
            name: "Salle de bain",
            place: "Bordeaux (33)",
            status: "À planifier",
            tone: "amber",
          },
          {
            name: "Terrasse bois",
            place: "Nantes (44)",
            status: "Terminé",
            tone: "green",
          },
        ].map((project) => (
          <div className="fp-project-row" key={project.name}>
            <i>
              <HardHat />
            </i>
            <div>
              <b>{project.name}</b>
              <small>{project.place}</small>
            </div>
            <span className={`fp-status ${project.tone}`}>
              {project.status}
            </span>
            <ChevronRight />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ForgeoPublicEntry({ onLogin, onSignup }: Props) {
  return (
    <main className="fp-page" id="accueil">
      <header className="fp-header">
        <a href="#accueil" aria-label="FORGEO, accueil">
          <ForgeoBrand />
        </a>
        <nav className="fp-nav" aria-label="Navigation principale">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#tarifs">Tarifs</a>
          <a href="#apropos">À propos</a>
        </nav>
        <div className="fp-header-actions">
          <button className="fp-login" onClick={onLogin}>
            Connexion
          </button>
          <button className="fp-primary" onClick={onSignup}>
            Créer mon compte
          </button>
        </div>
      </header>
      <section className="fp-hero">
        <div className="fp-hero-copy">
          <span className="fp-eyebrow">POUR LES ARTISANS DU BÂTIMENT</span>
          <h1>
            Vos devis, vos factures,
            <br className="fp-desktop-break" /> vos chantiers.
            <br />
            <em>Au même endroit.</em>
          </h1>
          <p>
            Du premier devis au dernier jour de chantier, gardez le fil de votre
            activité avec FORGEO.
          </p>
          <div className="fp-hero-actions">
            <button className="fp-primary" onClick={onSignup}>
              Créer mon compte
            </button>
            <a className="fp-secondary" href="#fonctionnalites">
              Voir le logiciel
            </a>
          </div>
          <small className="fp-hero-note">
            Au bureau comme sur le terrain.
          </small>
        </div>
        <div className="fp-hero-visual">
          <div className="fp-hero-photo">
            <ArtisanPhoto priority />
          </div>
          <ProjectPreview />
        </div>
      </section>
      <section className="fp-benefits" aria-labelledby="fp-benefits-title">
        <h2 id="fp-benefits-title">
          Tout pour faire avancer votre entreprise.
        </h2>
        <div className="fp-benefit-grid">
          <article>
            <FileText />
            <div>
              <h3>Devis et factures</h3>
              <p>
                Préparez vos documents,
                <br />
                retrouvez vos échanges.
              </p>
            </div>
          </article>
          <article>
            <HardHat />
            <div>
              <h3>Suivi des chantiers</h3>
              <p>
                Étapes, photos et incidents
                <br />
                au même endroit.
              </p>
            </div>
          </article>
          <article>
            <UsersRound />
            <div>
              <h3>Clients et équipe</h3>
              <p>
                Gardez les bonnes informations
                <br />à portée de main.
              </p>
            </div>
          </article>
        </div>
      </section>
      <section className="fp-features" id="fonctionnalites">
        <div className="fp-section-heading">
          <span className="fp-eyebrow">VOTRE QUOTIDIEN, SIMPLEMENT</span>
          <h2>
            Moins de paperasse.
            <br />
            Plus de place pour votre métier.
          </h2>
          <p>
            Des outils qui suivent votre travail, du rendez-vous client à la fin
            du chantier.
          </p>
        </div>
        <div className="fp-feature-grid">
          <article>
            <FileText />
            <h3>Du devis à la facture</h3>
            <p>
              Préparez vos documents, vérifiez les montants et retrouvez
              l’historique de chaque client.
            </p>
          </article>
          <article>
            <HardHat />
            <h3>Le chantier dans votre poche</h3>
            <p>
              Organisez les étapes, attribuez les tâches et ajoutez les photos
              prises sur le terrain.
            </p>
          </article>
          <article>
            <Mic />
            <h3>Dictez, puis vérifiez</h3>
            <p>
              L’assistant structure votre demande. Vous gardez la main sur les
              informations et l’envoi.
            </p>
          </article>
        </div>
      </section>
      <section className="fp-about" id="apropos">
        <div>
          <span className="fp-eyebrow">L’ALLIÉ DES ARTISANS</span>
          <h2>
            Un seul espace.
            <br />
            Tout le fil de votre activité.
          </h2>
          <p>
            FORGEO réunit vos clients, vos documents et vos chantiers dans un
            espace accessible sur ordinateur et mobile.
          </p>
        </div>
        <div className="fp-about-details">
          <article>
            <ShieldCheck />
            <div>
              <h3>Vos données, votre entreprise</h3>
              <p>
                Les accès aux données et aux photos de chantier sont limités aux
                membres de votre organisation.
              </p>
            </div>
          </article>
          <article>
            <Check />
            <div>
              <h3>Vos prix restent vos prix.</h3>
              <p>
                Une quantité ou un prix manque ? L’information reste à préciser
                avant de finaliser votre document.
              </p>
            </div>
          </article>
        </div>
      </section>
      <section className="fp-pricing" id="tarifs">
        <div>
          <span className="fp-eyebrow">POUR VOTRE ENTREPRISE</span>
          <h2>
            Vos outils au même endroit.
            <br />
            Un abonnement clair.
          </h2>
          <p>Devis, factures, clients, équipe et suivi des chantiers.</p>
        </div>
        <div className="fp-price">
          <p>
            <strong>99 €</strong> HT / mois
          </p>
          <button className="fp-primary" onClick={onSignup}>
            Créer mon compte
          </button>
        </div>
      </section>
      <footer className="fp-footer">
        <a href="#accueil" aria-label="FORGEO, accueil">
          <ForgeoBrand compact />
        </a>
        <p>Gestion métier pour artisans du bâtiment.</p>
        <button className="fp-login" onClick={onLogin}>
          Connexion
        </button>
      </footer>
    </main>
  );
}
