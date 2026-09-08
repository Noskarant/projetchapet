"use client";

type Props = {
  onLogin: () => void;
  onSignup: () => void;
};

function Mark() {
  return (
    <span className="fg-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <rect width="64" height="64" rx="18" fill="currentColor" />
        <path d="M17 44 29 17h7l12 27h-8l-2.1-5.4H26.8L24.7 44H17Zm12.3-12h6.2l-3.1-8-3.1 8Z" fill="#f5efe1" />
      </svg>
    </span>
  );
}

function ProductPreview() {
  return (
    <div className="fg-preview" aria-label="Aperçu du flux devis FORGEO">
      <header>
        <div><Mark /><b>FORGEO</b></div>
        <span>Brouillon</span>
      </header>
      <section className="fg-preview-head">
        <div><small>DEVIS</small><strong>Rénovation séjour</strong><em>M. Martin · Lyon 5e</em></div>
        <b>DEV-2026-041</b>
      </section>
      <div className="fg-lines">
        <div><span>Préparation des murs</span><small>42 m²</small><b>À préciser</b></div>
        <div><span>Peinture murs, 2 couches</span><small>42 m²</small><b>28,00 € / m²</b></div>
        <div><span>Protection du chantier</span><small>À préciser</small><b>À préciser</b></div>
      </div>
      <div className="fg-preview-note"><b>✓</b><p><strong>Vos prix restent vos prix.</strong> Une donnée absente reste à préciser au lieu d’être inventée.</p></div>
      <footer><span>PDF propre</span><span>Envoyer au client</span></footer>
    </div>
  );
}

export default function ForgeoPublicEntry({ onLogin, onSignup }: Props) {
  return (
    <main className="fg-public">
      <div className="fg-topline">Pilote FORGEO · pensé pour les artisans du bâtiment</div>
      <nav className="fg-nav" aria-label="Navigation FORGEO">
        <a href="#accueil" className="fg-logo" aria-label="FORGEO, accueil"><Mark /><span>FORGEO</span></a>
        <div className="fg-links"><a href="#produit">Produit</a><a href="#controle">Pourquoi FORGEO</a><a href="#securite">Sécurité</a></div>
        <div className="fg-nav-actions"><button type="button" className="fg-ghost" onClick={onLogin}>Se connecter</button><button type="button" className="fg-nav-cta" onClick={onSignup}>Créer mon espace</button></div>
      </nav>

      <section className="fg-hero" id="accueil">
        <div className="fg-hero-copy">
          <span className="fg-eyebrow"><i /> L’outil de gestion pensé chantier d’abord</span>
          <h1>Moins de paperasse.<br /><em>Plus de chantier.</em></h1>
          <p>Devis, factures, clients et suivi de chantier dans un seul outil simple, mobile et pensé pour les métiers du bâtiment.</p>
          <div className="fg-actions"><button type="button" className="fg-primary" onClick={onSignup}>Créer mon espace FORGEO <b>→</b></button><button type="button" className="fg-secondary" onClick={onLogin}>J’ai déjà un compte</button></div>
          <div className="fg-trust"><span>✓ Vos prix restent vos prix</span><span>✓ Données séparées par entreprise</span><span>✓ Mobile & ordinateur</span></div>
        </div>
        <div className="fg-hero-product">
          <span className="fg-preview-label">APERÇU DU FLUX DEVIS</span>
          <ProductPreview />
          <aside><small>SUR LE CHANTIER</small><strong>Dictez. Vérifiez. Envoyez.</strong><span>Pas besoin de tout retaper le soir.</span></aside>
        </div>
      </section>

      <section className="fg-proof" aria-label="Principes FORGEO">
        <div><b>01</b><span><strong>Prise en main directe</strong><small>Les actions utiles restent devant vous.</small></span></div>
        <div><b>02</b><span><strong>Pensé bâtiment</strong><small>Devis, TVA, clients et chantiers.</small></span></div>
        <div><b>03</b><span><strong>Contrôle artisan</strong><small>Aucun prix remplacé silencieusement.</small></span></div>
        <div><b>04</b><span><strong>Une activité centralisée</strong><small>Du premier contact au paiement.</small></span></div>
      </section>

      <section className="fg-section" id="produit">
        <header className="fg-section-title"><span>LE QUOTIDIEN, EN PLUS SIMPLE</span><h2>Gérer l’entreprise sans y passer vos soirées.</h2><p>FORGEO rassemble les tâches qui reviennent tous les jours et garde l’artisan aux commandes.</p></header>
        <div className="fg-features">
          <article className="fg-feature fg-feature-main"><small>01</small><h3>Préparez le devis pendant que le chantier est encore frais.</h3><p>Décrivez les travaux comme vous les diriez à un collègue. FORGEO structure un brouillon que vous vérifiez avant de l’enregistrer ou de l’envoyer.</p><div className="fg-voice"><b>●</b><span><small>EXEMPLE</small><strong>« Chez Martin, 42 m² de murs, deux couches, TVA 10 %. »</strong></span></div></article>
          <article className="fg-feature"><small>02</small><h3>Clients & documents propres</h3><p>Coordonnées, devis, factures et historique restent accessibles au même endroit.</p></article>
          <article className="fg-feature"><small>03</small><h3>Repères de prix sourcés</h3><p>Un repère disponible peut être affiché, mais il n’est appliqué que si vous le choisissez explicitement.</p></article>
          <article className="fg-feature"><small>04</small><h3>Chantier & rentabilité</h3><p>Suivez avancement et coûts pour voir ce qui se passe réellement sur chaque affaire.</p></article>
          <article className="fg-feature"><small>05</small><h3>Préparation e-facturation</h3><p>Un espace dédié aide à préparer les informations nécessaires aux futures étapes de facturation électronique.</p></article>
        </div>
      </section>

      <section className="fg-control" id="controle">
        <div>
          <span className="fg-kicker">LA DIFFÉRENCE FORGEO</span>
          <h2>Ce que vous n’avez pas dit<br />n’est pas inventé.</h2>
          <p>Gagner du temps ne doit pas signifier laisser un logiciel décider à votre place. Si une quantité, une unité, un prix ou une TVA manque, FORGEO le signale au lieu de fabriquer une valeur crédible mais fausse.</p>
          <ul><li>Prix dicté : conservé</li><li>Prix absent : à préciser</li><li>Modification : visible avant envoi</li></ul>
        </div>
        <article className="fg-check-card"><small>POSTE À VÉRIFIER</small><h3>Protection et préparation du chantier</h3><div><span>Quantité</span><b>À préciser</b></div><div><span>Unité</span><b>À préciser</b></div><div><span>Prix unitaire</span><b>À préciser</b></div><p>Rien n’est transformé en « 1 forfait · 0,00 € » uniquement pour remplir le document.</p></article>
      </section>

      <section className="fg-security" id="securite">
        <header className="fg-section-title"><span>SÉCURITÉ</span><h2>Votre entreprise a son propre espace.</h2></header>
        <div className="fg-security-grid">
          <article><strong>Entreprise séparée</strong><p>Clients, devis, factures et espace de travail sont rattachés à votre entreprise avec des règles d’accès dédiées.</p></article>
          <article><strong>Synchronisation sécurisée</strong><p>Les données de travail sont synchronisées dans le cloud et le cache sensible est nettoyé après une déconnexion réussie.</p></article>
          <article><strong>Validation humaine</strong><p>FORGEO prépare et accélère. L’artisan garde la validation finale des informations métier et des prix.</p></article>
        </div>
      </section>

      <section className="fg-final">
        <div><span>PILOTE FORGEO</span><h2>La gestion qui suit votre façon de travailler, pas l’inverse.</h2><p>Créez votre espace entreprise et commencez avec vos vrais clients et vos vrais devis.</p></div>
        <button type="button" className="fg-final-cta" onClick={onSignup}>Créer mon espace <b>→</b></button>
      </section>

      <footer className="fg-footer"><a href="#accueil" className="fg-logo"><Mark /><span>FORGEO</span></a><p>Gestion métier pour artisans du bâtiment.</p><button type="button" onClick={onLogin}>Connexion</button></footer>
      <PublicStyles />
    </main>
  );
}

function PublicStyles() {
  return <style>{`
    :root{--fg:#102922;--fg2:#173a31;--ink:#172a23;--paper:#fbf8f1;--cream:#f2eadb;--orange:#e66b37;--line:#dad3c6}.fg-public{min-height:100dvh;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;overflow-x:hidden}.fg-topline{min-height:31px;padding:4px 16px;display:grid;place-items:center;background:var(--fg);color:#f7f0e4;font-size:9px;font-weight:850;letter-spacing:.08em;text-align:center}.fg-nav{height:75px;max-width:1220px;margin:auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:22px;border-bottom:1px solid rgba(16,41,34,.12)}.fg-logo{display:inline-flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font-size:19px;font-weight:950;letter-spacing:.08em}.fg-mark{width:34px;height:34px;display:inline-grid;color:var(--fg)}.fg-mark svg{width:100%;height:100%}.fg-links{display:flex;gap:28px}.fg-links a{color:#5d6b66;text-decoration:none;font-size:11px;font-weight:800}.fg-nav-actions{display:flex;gap:8px}.fg-nav button,.fg-actions button,.fg-footer button,.fg-final button{cursor:pointer;font-family:Arial,sans-serif}.fg-ghost{padding:10px;border:0;background:transparent;color:var(--fg);font-weight:850}.fg-nav-cta{padding:11px 15px;border:0;border-radius:9px;background:var(--fg);color:#fff;font-weight:900}.fg-hero{max-width:1220px;min-height:650px;margin:auto;padding:74px 28px 70px;display:grid;grid-template-columns:minmax(0,1fr) minmax(430px,.92fr);gap:68px;align-items:center}.fg-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#61706a;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.fg-eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--orange)}.fg-hero h1{margin:22px 0 0;color:var(--fg);font-size:clamp(48px,6vw,76px);line-height:.96;letter-spacing:-.055em}.fg-hero h1 em{color:var(--orange);font-style:normal}.fg-hero-copy>p{max-width:590px;margin:26px 0 0;color:#596762;font-size:17px;line-height:1.55}.fg-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:30px}.fg-primary,.fg-secondary{min-height:50px;padding:0 19px;border-radius:10px;font-weight:900}.fg-primary{border:0;background:var(--fg);color:#fff;box-shadow:0 13px 29px rgba(16,41,34,.16)}.fg-primary b{margin-left:11px;font-size:18px}.fg-secondary{border:1px solid #cec7ba;background:#fff;color:var(--fg)}.fg-trust{display:flex;gap:12px 22px;flex-wrap:wrap;margin-top:23px;color:#6d7974;font-size:10px;font-weight:800}.fg-hero-product{position:relative;padding:32px 0 30px}.fg-hero-product:before{content:"";position:absolute;right:-55px;top:-15px;width:330px;height:330px;border-radius:50%;background:#eadfc9}.fg-preview-label{position:absolute;z-index:3;right:0;top:0;padding:7px 10px;border:1px solid #d7cfbf;border-radius:999px;background:var(--paper);color:#697670;font-size:7px;font-weight:950;letter-spacing:.14em}.fg-preview{position:relative;z-index:2;max-width:500px;margin-left:auto;border:1px solid #d6cfc1;border-radius:18px;background:#fff;box-shadow:0 28px 70px rgba(27,40,35,.14);overflow:hidden}.fg-preview>header{height:55px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;background:var(--fg);color:#fff}.fg-preview>header>div{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.08em}.fg-preview>header .fg-mark{width:23px;height:23px;color:#18362e}.fg-preview>header>span{padding:5px 8px;border-radius:999px;background:#f2d6a1;color:#6d4b0d;font-size:8px;font-weight:900}.fg-preview-head{padding:20px;display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #ece6db}.fg-preview-head>div{display:grid;gap:3px}.fg-preview-head small{font-size:7px;color:#858f8a;font-weight:900;letter-spacing:.11em}.fg-preview-head strong{font-size:17px;color:var(--fg)}.fg-preview-head em{font-size:9px;color:#6c7873;font-style:normal}.fg-preview-head>b{font-size:8px;color:#78837f}.fg-lines{padding:3px 20px}.fg-lines>div{padding:12px 0;display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;border-bottom:1px solid #eee9df}.fg-lines span{font-size:10px;font-weight:800}.fg-lines small{font-size:8px;color:#68746f}.fg-lines b{min-width:77px;text-align:right;font-size:8px;color:var(--fg)}.fg-lines>div:first-child b,.fg-lines>div:last-child b{color:#a34e2c}.fg-preview-note{margin:13px 20px 17px;padding:10px;display:flex;gap:8px;border-radius:9px;background:#f0f5f1;color:#486158}.fg-preview-note p{margin:0;font-size:8px;line-height:1.45}.fg-preview>footer{padding:12px 20px;display:flex;justify-content:flex-end;gap:7px;background:#f7f4ed}.fg-preview>footer span{padding:7px 9px;border:1px solid #ddd6ca;border-radius:7px;background:#fff;font-size:7px;font-weight:900}.fg-hero-product>aside{position:absolute;z-index:3;left:-22px;bottom:-5px;width:210px;padding:14px;border-radius:12px;background:var(--orange);color:#fff;box-shadow:0 18px 38px rgba(126,60,28,.2);display:grid;gap:4px}.fg-hero-product>aside small{font-size:7px;font-weight:900;letter-spacing:.13em;opacity:.85}.fg-hero-product>aside strong{font-size:13px}.fg-hero-product>aside span{font-size:8px;opacity:.9}.fg-proof{max-width:1220px;margin:auto;padding:0 28px 55px;display:grid;grid-template-columns:repeat(4,1fr)}.fg-proof>div{min-height:92px;padding:16px 18px;display:flex;align-items:center;gap:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.fg-proof>div+div{border-left:1px solid var(--line)}.fg-proof>div>b{color:var(--orange);font-size:9px}.fg-proof span{display:grid;gap:4px}.fg-proof strong{color:var(--fg);font-size:10px}.fg-proof small{color:#74807b;font-size:8px;line-height:1.35}.fg-section,.fg-security{max-width:1220px;margin:auto;padding:82px 28px}.fg-section-title{max-width:780px;margin-bottom:36px}.fg-section-title>span,.fg-kicker,.fg-final>div>span{color:var(--orange);font-size:8px;font-weight:950;letter-spacing:.15em}.fg-section-title h2,.fg-control h2,.fg-final h2{margin:10px 0 0;color:var(--fg);font-size:clamp(32px,4vw,47px);line-height:1.06;letter-spacing:-.04em}.fg-section-title p{max-width:620px;margin:14px 0 0;color:#65716c;font-size:12px;line-height:1.55}.fg-features{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.fg-feature{position:relative;min-height:210px;padding:27px;border:1px solid #ddd6ca;border-radius:15px;background:#fff;overflow:hidden}.fg-feature-main{grid-row:span 2;min-height:435px;background:var(--fg);color:#fff}.fg-feature>small{display:block;margin-bottom:38px;color:var(--orange);font-weight:950}.fg-feature h3{max-width:480px;margin:0;color:var(--fg);font-size:21px;line-height:1.16}.fg-feature p{max-width:520px;margin:13px 0 0;color:#68746f;font-size:11px;line-height:1.55}.fg-feature-main h3{color:#fff;font-size:32px}.fg-feature-main p{color:#c3d1cb;font-size:12px}.fg-voice{position:absolute;left:27px;right:27px;bottom:27px;padding:13px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:rgba(255,255,255,.06);display:flex;align-items:center;gap:10px}.fg-voice>b{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:var(--orange);font-size:8px}.fg-voice span{display:grid;gap:2px}.fg-voice small{color:#93aaa1;font-size:6px;letter-spacing:.13em}.fg-voice strong{font-size:9px;line-height:1.4}.fg-control{max-width:1164px;margin:36px auto 82px;padding:56px;display:grid;grid-template-columns:1fr .78fr;gap:60px;align-items:center;border-radius:22px;background:#ece3d3}.fg-control>div>p{max-width:565px;margin:19px 0;color:#5b6862;font-size:12px;line-height:1.65}.fg-control ul{margin:18px 0 0;padding:0;display:grid;gap:8px;list-style:none;color:#305047;font-size:10px;font-weight:850}.fg-control li:before{content:"✓";margin-right:8px}.fg-check-card{padding:22px;border:1px solid #cec2ad;border-radius:15px;background:#fff;box-shadow:0 20px 42px rgba(56,48,37,.08)}.fg-check-card>small{color:var(--orange);font-size:7px;font-weight:950;letter-spacing:.12em}.fg-check-card h3{margin:8px 0 15px;color:var(--fg);font-size:16px}.fg-check-card>div{padding:10px 0;display:flex;justify-content:space-between;border-top:1px solid #eee8dc;font-size:9px}.fg-check-card>div span{color:#707b76}.fg-check-card>div b{color:#a44e2c}.fg-check-card p{margin:13px 0 0;padding:9px;border-radius:8px;background:#f8f2e8;color:#675d4e;font-size:8px;line-height:1.5}.fg-security{padding-top:70px;padding-bottom:92px}.fg-security-grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.fg-security-grid article{padding:24px}.fg-security-grid article+article{border-left:1px solid var(--line)}.fg-security-grid strong{color:var(--fg);font-size:12px}.fg-security-grid p{margin:10px 0 0;color:#697570;font-size:9px;line-height:1.55}.fg-final{max-width:1164px;margin:0 auto 68px;padding:50px 55px;display:flex;justify-content:space-between;align-items:end;gap:35px;border-radius:21px;background:var(--fg);color:#fff}.fg-final h2{max-width:720px;color:#fff}.fg-final p{margin:14px 0 0;color:#bdccc6;font-size:11px}.fg-final-cta{min-height:49px;padding:0 18px;border:0;border-radius:10px;background:#f5eedf;color:var(--fg);font-weight:900;white-space:nowrap}.fg-final-cta b{margin-left:10px;font-size:17px}.fg-footer{max-width:1220px;margin:auto;padding:26px 28px;display:flex;align-items:center;gap:20px;border-top:1px solid var(--line)}.fg-footer p{margin:0;color:#7b8581;font-size:9px}.fg-footer button{margin-left:auto;border:0;background:transparent;color:var(--fg);font-weight:850}@media(max-width:900px){.fg-links{display:none}.fg-hero{grid-template-columns:1fr;gap:34px;padding-top:55px}.fg-hero-copy{text-align:center}.fg-eyebrow,.fg-actions,.fg-trust{justify-content:center}.fg-hero-copy>p{margin-left:auto;margin-right:auto}.fg-hero-product{width:min(600px,100%);margin:auto}.fg-preview{margin:auto}.fg-proof{grid-template-columns:repeat(2,1fr)}.fg-proof>div:nth-child(3){border-left:0}.fg-control{margin-left:20px;margin-right:20px;grid-template-columns:1fr;padding:40px}.fg-security-grid{grid-template-columns:1fr}.fg-security-grid article+article{border-left:0;border-top:1px solid var(--line)}.fg-final{margin-left:20px;margin-right:20px;align-items:flex-start;flex-direction:column}}@media(max-width:620px){.fg-nav{height:63px;padding:0 17px}.fg-nav-cta{display:none}.fg-logo{font-size:16px}.fg-logo .fg-mark{width:29px;height:29px}.fg-hero{min-height:0;padding:47px 18px 53px}.fg-hero h1{font-size:45px}.fg-hero-copy>p{font-size:14px}.fg-actions{display:grid;width:100%}.fg-actions button{width:100%}.fg-trust{display:grid;justify-content:start;text-align:left}.fg-preview-label{display:none}.fg-hero-product{padding-top:4px}.fg-preview-head,.fg-lines{padding-left:14px;padding-right:14px}.fg-lines>div{grid-template-columns:1fr auto}.fg-lines>div>b{grid-column:1/-1;text-align:left}.fg-preview-note{margin:11px 14px}.fg-hero-product>aside{position:relative;left:auto;bottom:auto;width:auto;margin:-7px 14px 0}.fg-proof{padding:0 18px 43px;grid-template-columns:1fr}.fg-proof>div+div{border-left:0;border-top:0}.fg-section,.fg-security{padding:60px 18px}.fg-section-title h2,.fg-control h2,.fg-final h2{font-size:33px}.fg-features{grid-template-columns:1fr}.fg-feature-main{grid-row:auto;min-height:410px}.fg-feature{padding:22px}.fg-feature-main h3{font-size:27px}.fg-voice{left:22px;right:22px;bottom:22px}.fg-control{margin:8px 12px 58px;padding:29px 22px;gap:32px}.fg-final{margin:0 12px 43px;padding:33px 23px}.fg-footer{padding:22px 18px}.fg-footer p{display:none}}
  `}</style>;
}
