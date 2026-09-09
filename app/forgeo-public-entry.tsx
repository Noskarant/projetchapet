"use client";

type Props = {
  onLogin: () => void;
  onSignup: () => void;
};

type IconName = "shield" | "bolt" | "clock" | "people" | "chart" | "document" | "spark" | "check";

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === "shield" && <><path {...common} d="M12 3 19 6v5c0 4.6-2.7 8-7 10-4.3-2-7-5.4-7-10V6l7-3Z"/><path {...common} d="m9 12 2 2 4-5"/></>}
      {name === "bolt" && <path {...common} d="m13.5 2-7 11h5L10.5 22l7-12h-5l1-8Z"/>}
      {name === "clock" && <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M12 7v6l4 2"/></>}
      {name === "people" && <><path {...common} d="M16 20v-1.5c0-2.2-1.8-4-4-4H7c-2.2 0-4 1.8-4 4V20"/><circle {...common} cx="9.5" cy="7.5" r="3.5"/><path {...common} d="M17 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.6 3 2.1 3 4V20"/></>}
      {name === "chart" && <><path {...common} d="M4 20V10m6 10V5m6 15v-7m4 7H2"/></>}
      {name === "document" && <><path {...common} d="M6 2h8l4 4v16H6z"/><path {...common} d="M14 2v5h5M9 12h6m-6 4h6"/></>}
      {name === "spark" && <><path {...common} d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2Z"/><path {...common} d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></>}
      {name === "check" && <path {...common} d="m5 12 4 4L19 6"/>}
    </svg>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`fp-brand${compact ? " fp-brand-compact" : ""}`}>
      <img src="/forgeo-mark.svg" alt="" aria-hidden="true" />
      <span><b>FORGEO</b><small>L’ALLIÉ DES ARTISANS</small></span>
    </span>
  );
}

function DashboardPreview() {
  return (
    <div className="fp-dashboard" aria-label="Aperçu du tableau de bord FORGEO">
      <aside>
        <Brand compact />
        <nav>
          <span className="active">⌂ <b>Tableau de bord</b></span>
          <span>♙ <b>Clients</b></span>
          <span>▤ <b>Devis</b></span>
          <span>▧ <b>Factures</b></span>
          <span>◷ <b>Suivi d’activité</b></span>
          <span>⚙ <b>Paramètres</b></span>
        </nav>
      </aside>
      <div className="fp-dashboard-main">
        <header><div><small>Bonjour,</small><strong>Bon travail aujourd’hui !</strong></div><span>Atelier Martin · ●</span></header>
        <div className="fp-stats">
          <article><span>Clients</span><strong>32</strong><small>+8%</small></article>
          <article><span>Devis</span><strong>14</strong><small>+21%</small></article>
          <article><span>Factures</span><strong>9</strong><small>+6%</small></article>
          <article><span>CA du mois</span><strong>18 260 €</strong><small>+10%</small></article>
        </div>
        <div className="fp-dashboard-grid">
          <article className="fp-chart-card">
            <div><strong>Évolution du chiffre d’affaires</strong><span>18 260 €</span></div>
            <svg viewBox="0 0 500 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 135C45 115 60 90 96 102s50-18 82-22 42 21 76 8 40-55 83-44 43 48 83 27 47-48 80-58"/><path className="fill" d="M0 135C45 115 60 90 96 102s50-18 82-22 42 21 76 8 40-55 83-44 43 48 83 27 47-48 80-58V160H0Z"/></svg>
            <div className="fp-chart-months"><span>Avr</span><span>Mai</span><span>Juin</span><span>Juil</span><span>Août</span><span>Sept</span></div>
          </article>
          <article className="fp-activity-card">
            <strong>Dernières activités</strong>
            <div><i className="blue">▤</i><span><b>Devis ajouté</b><small>Rénovation cuisine</small></span></div>
            <div><i className="orange">▧</i><span><b>Facture envoyée</b><small>Client Dupont</small></span></div>
            <div><i className="green">♙</i><span><b>Nouveau client</b><small>Bernard Rénovation</small></span></div>
          </article>
        </div>
      </div>
    </div>
  );
}

export default function ForgeoPublicEntry({ onLogin, onSignup }: Props) {
  return (
    <main className="fp-page" id="accueil">
      <header className="fp-header">
        <a href="#accueil" className="fp-home" aria-label="FORGEO, accueil"><Brand /></a>
        <nav className="fp-nav" aria-label="Navigation principale">
          <a href="#solution">Solution</a>
          <a href="#benefices">Pourquoi FORGEO</a>
          <a href="#securite">Sécurité</a>
        </nav>
        <div className="fp-header-actions">
          <button type="button" className="fp-login" onClick={onLogin}>Connexion</button>
          <button type="button" className="fp-start" onClick={onSignup}>Commencer</button>
        </div>
      </header>

      <section className="fp-hero">
        <div className="fp-hero-copy">
          <span className="fp-eyebrow">ARTISANS DU BÂTIMENT · PLUS FORTS ENSEMBLE</span>
          <h1>Des outils concrets<br />pour ceux qui bâtissent <em>vraiment.</em></h1>
          <p>Gérez vos clients, devis, factures et votre activité où que vous soyez. Un logiciel pensé pour les artisans, sur le terrain comme au bureau.</p>
          <div className="fp-hero-actions">
            <button type="button" className="fp-primary" onClick={onSignup}>Commencer gratuitement <span>→</span></button>
            <button type="button" className="fp-secondary" onClick={onLogin}>J’ai déjà un compte</button>
          </div>
          <div className="fp-hero-note">Pas de carte bancaire pour démarrer · Votre espace entreprise reste séparé et sécurisé.</div>
        </div>

        <div className="fp-hero-visual" aria-label="Artisans du bâtiment avec FORGEO">
          <div className="fp-site-lines" aria-hidden="true" />
          <img className="fp-workers" src="/forgeo-workers.svg" alt="Deux artisans du bâtiment en casque sur un chantier" />
          <div className="fp-visual-badge"><span>FORGEO SUR LE TERRAIN</span><strong>Clients. Devis. Factures.</strong><small>Tout au même endroit.</small></div>
          <p className="fp-handwritten">Le même métier,<br />plus de possibilités.</p>
        </div>
      </section>

      <section className="fp-benefit-strip" id="benefices" aria-label="Bénéfices FORGEO">
        <article><i><Icon name="people" /></i><span><b>Pensé pour les artisans</b><small>Un outil proche du terrain.</small></span></article>
        <article><i><Icon name="clock" /></i><span><b>Gain de temps</b><small>Moins de saisie, plus d’action.</small></span></article>
        <article><i><Icon name="shield" /></i><span><b>100% sécurisé</b><small>Un espace par entreprise.</small></span></article>
        <article><i><Icon name="chart" /></i><span><b>Un vrai accompagnement</b><small>Votre activité reste lisible.</small></span></article>
      </section>

      <section className="fp-solution" id="solution">
        <header className="fp-section-heading">
          <span>UNE GESTION SIMPLE POUR AVANCER PLUS LOIN</span>
          <h2>Moins de paperasse.<br /><em>Plus de chantiers.</em></h2>
          <p>FORGEO centralise les outils utiles au quotidien sans transformer votre métier en usine à gaz.</p>
        </header>
        <div className="fp-feature-grid">
          <article className="fp-feature fp-feature-blue"><i><Icon name="document" /></i><span>DEVIS & FACTURES</span><h3>Des documents propres, créés sans perdre la soirée.</h3><p>Préparez, vérifiez, envoyez et retrouvez vos documents au même endroit.</p></article>
          <article className="fp-feature"><i><Icon name="people" /></i><span>CLIENTS</span><h3>Le bon historique, devant vous quand le client rappelle.</h3><p>Coordonnées, affaires et documents restent liés à chaque client.</p></article>
          <article className="fp-feature"><i><Icon name="spark" /></i><span>ASSISTANT FORGEO</span><h3>Dictez sur le terrain. Vérifiez avant d’envoyer.</h3><p>FORGEO peut structurer ce que vous dites sans décider silencieusement à votre place.</p></article>
          <article className="fp-feature"><i><Icon name="chart" /></i><span>ACTIVITÉ</span><h3>Voyez ce qui avance et ce qui mérite votre attention.</h3><p>Des repères simples pour suivre le chiffre d’affaires, les devis et les affaires.</p></article>
        </div>
      </section>

      <section className="fp-product-section">
        <div className="fp-product-copy">
          <span>VOTRE ENTREPRISE, EN UN COUP D’ŒIL</span>
          <h2>Une interface claire au bureau.<br />La même logique sur mobile.</h2>
          <p>Le tableau de bord réunit ce qui compte, sans vous noyer sous des menus. Vous retrouvez vos clients, vos documents et votre activité dès l’ouverture.</p>
          <ul>
            <li><i><Icon name="check" /></i> Des actions principales visibles immédiatement</li>
            <li><i><Icon name="check" /></i> Des statuts lisibles pour vos devis et factures</li>
            <li><i><Icon name="check" /></i> Un fonctionnement pensé desktop et chantier</li>
          </ul>
        </div>
        <DashboardPreview />
      </section>

      <section className="fp-control" id="securite">
        <div className="fp-control-card">
          <span>LE CONTRÔLE RESTE CHEZ L’ARTISAN</span>
          <h2>Vos prix restent vos prix.</h2>
          <p>Une information manque ? FORGEO la signale comme « À préciser » au lieu d’inventer une quantité, une unité ou un prix crédible mais faux.</p>
          <div className="fp-check-lines">
            <div><span>Quantité</span><b>À préciser</b></div>
            <div><span>Unité</span><b>À préciser</b></div>
            <div><span>Prix unitaire</span><b>À préciser</b></div>
          </div>
        </div>
        <div className="fp-security-copy">
          <i><Icon name="shield" /></i>
          <span>ESPACE ENTREPRISE SÉCURISÉ</span>
          <h2>Simple à utiliser.<br />Sérieux avec vos données.</h2>
          <p>Chaque entreprise dispose de son propre espace. Les données de travail sont synchronisées dans le cloud avec des règles d’accès dédiées.</p>
          <div className="fp-security-points"><span>✓ Données séparées par entreprise</span><span>✓ Synchronisation sécurisée</span><span>✓ Validation humaine avant envoi</span></div>
        </div>
      </section>

      <section className="fp-testimonials" aria-label="Retours artisans">
        <article><div className="fp-avatar">TM</div><blockquote>« Enfin un outil qui parle comme notre quotidien : clair, direct et sans détour. »</blockquote><footer><b>Thomas M.</b><span>Artisan maçon</span><strong>★★★★★</strong></footer></article>
        <article><div className="fp-avatar">SN</div><blockquote>« Je retrouve mes devis, mes clients et ce que j’ai à faire sans chercher partout. »</blockquote><footer><b>Sébastien N.</b><span>Gérant, rénovation</span><strong>★★★★★</strong></footer></article>
        <article><div className="fp-avatar">JR</div><blockquote>« Sur mobile, je peux avancer directement après le rendez-vous chantier. »</blockquote><footer><b>Julien R.</b><span>Artisan plaquiste</span><strong>★★★★★</strong></footer></article>
      </section>

      <section className="fp-final-cta">
        <div><Brand /><h2>Des projets solides pour les artisans qui vont plus loin.</h2><p>Créez votre espace FORGEO et commencez avec vos vrais clients, vos vrais devis et vos vrais chantiers.</p></div>
        <button type="button" onClick={onSignup}>Créer mon espace FORGEO <span>→</span></button>
      </section>

      <footer className="fp-footer">
        <Brand />
        <p>Gestion métier pour artisans du bâtiment.</p>
        <div><span><Icon name="shield" /> Sécurisé</span><span><Icon name="bolt" /> Simple</span><span><Icon name="chart" /> Efficace</span><span><Icon name="people" /> Humain</span></div>
        <button type="button" onClick={onLogin}>Connexion</button>
      </footer>
    </main>
  );
}
