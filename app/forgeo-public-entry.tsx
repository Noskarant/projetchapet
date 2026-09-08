"use client";

type Props = {
  onLogin: () => void;
  onSignup: () => void;
};

function BrandMark() {
  return (
    <span className="fpe-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <rect width="64" height="64" rx="18" fill="currentColor" />
        <path d="M17 44 29 17h7l12 27h-8l-2.1-5.4H26.8L24.7 44H17Zm12.3-12h6.2l-3.1-8-3.1 8Z" fill="#f5efdf" />
      </svg>
    </span>
  );
}

function QuoteMockup() {
  return (
    <div className="fpe-product-card" aria-label="Aperçu d'un devis FORGEO">
      <div className="fpe-product-topbar">
        <div className="fpe-product-brand"><BrandMark /><span>FORGEO</span></div>
        <span className="fpe-product-status">Brouillon</span>
      </div>
      <div className="fpe-product-heading">
        <div><small>DEVIS</small><strong>Rénovation séjour</strong><span>M. Martin · Lyon 5e</span></div>
        <b>DEV-2026-041</b>
      </div>
      <div className="fpe-product-lines">
        <div><span>Préparation des murs</span><strong>42 m²</strong><b>À préciser</b></div>
        <div><span>Peinture murs, 2 couches</span><strong>42 m²</strong><b>28,00 € / m²</b></div>
        <div><span>Protection du chantier</span><strong>1 forfait</strong><b>À préciser</b></div>
      </div>
      <div className="fpe-product-note"><span>✓</span><p><strong>FORGEO ne complète pas vos prix à votre place.</strong> Une donnée absente reste clairement à préciser.</p></div>
      <div className="fpe-product-actions"><span>PDF propre</span><span>Envoyer au client</span></div>
    </div>
  );
}

export default function ForgeoPublicEntry({ onLogin, onSignup }: Props) {
  return (
    <main className="fpe-shell">
      <div className="fpe-announcement">Pilote FORGEO · conçu avec et pour les artisans du bâtiment</div>
      <nav className="fpe-nav" aria-label="Navigation FORGEO">
        <a href="#top" className="fpe-logo" aria-label="FORGEO, accueil"><BrandMark /><span>FORGEO</span></a>
        <div className="fpe-navlinks">
          <a href="#produit">Produit</a>
          <a href="#confiance">Pourquoi FORGEO</a>
          <a href="#securite">Sécurité</a>
        </div>
        <div className="fpe-navactions">
          <button type="button" className="fpe-link-button" onClick={onLogin}>Se connecter</button>
          <button type="button" className="fpe-small-cta" onClick={onSignup}>Créer mon espace</button>
        </div>
      </nav>

      <section className="fpe-hero" id="top">
        <div className="fpe-hero-copy">
          <div className="fpe-kicker"><span>●</span> L'outil de gestion pensé chantier d'abord</div>
          <h1>Moins de paperasse.<br /><em>Plus de chantier.</em></h1>
          <p className="fpe-lead">Devis, factures, clients et suivi de chantier dans un seul outil simple, mobile et pensé pour les métiers du bâtiment.</p>
          <div className="fpe-hero-actions">
            <button type="button" className="fpe-primary" onClick={onSignup}>Créer mon espace FORGEO <span>→</span></button>
            <button type="button" className="fpe-secondary" onClick={onLogin}>J'ai déjà un compte</button>
          </div>
          <div className="fpe-trust-row">
            <span>✓ Vos prix restent vos prix</span>
            <span>✓ Données séparées par entreprise</span>
            <span>✓ Mobile & ordinateur</span>
          </div>
        </div>
        <div className="fpe-hero-visual">
          <div className="fpe-visual-label">UN VRAI DEVIS, PAS UNE DÉMO MARKETING</div>
          <QuoteMockup />
          <div className="fpe-floating-card"><small>Sur le chantier</small><strong>Dictez. Vérifiez. Envoyez.</strong><span>Pas besoin de tout retaper le soir.</span></div>
        </div>
      </section>

      <section className="fpe-proof-strip" aria-label="Promesses FORGEO">
        <div><b>01</b><span><strong>Simple à prendre en main</strong><small>Pas de logiciel usine à gaz.</small></span></div>
        <div><b>02</b><span><strong>Conçu pour le bâtiment</strong><small>Devis, TVA, clients, chantiers.</small></span></div>
        <div><b>03</b><span><strong>Vous gardez le contrôle</strong><small>Aucun prix inventé silencieusement.</small></span></div>
        <div><b>04</b><span><strong>Votre activité au même endroit</strong><small>Du premier contact au paiement.</small></span></div>
      </section>

      <section className="fpe-section" id="produit">
        <header className="fpe-section-heading"><span>LE QUOTIDIEN, EN PLUS SIMPLE</span><h2>Tout ce qu'il faut pour gérer l'entreprise<br />sans y passer vos soirées.</h2></header>
        <div className="fpe-feature-grid">
          <article className="fpe-feature fpe-feature-large">
            <span className="fpe-feature-no">01</span><h3>Un devis préparé pendant que le chantier est encore frais.</h3>
            <p>Décrivez les travaux comme vous les diriez à un collègue. FORGEO structure le brouillon, rattache le bon client et vous laisse vérifier chaque ligne avant envoi.</p>
            <div className="fpe-dictation"><span className="fpe-mic">●</span><div><small>EXEMPLE</small><strong>« Chez Martin, 42 m² de murs, deux couches, TVA 10 %. »</strong></div></div>
          </article>
          <article className="fpe-feature"><span className="fpe-feature-no">02</span><h3>Clients & documents propres</h3><p>Retrouvez coordonnées, devis, factures et historique sans chercher dans les mails ou les dossiers du téléphone.</p></article>
          <article className="fpe-feature"><span className="fpe-feature-no">03</span><h3>Repères de prix sourcés</h3><p>Quand un repère existe, FORGEO peut vous le montrer. Il n'est appliqué que si vous le choisissez explicitement.</p></article>
          <article className="fpe-feature"><span className="fpe-feature-no">04</span><h3>Suivi de chantier & rentabilité</h3><p>Gardez les étapes, les coûts et l'avancement visibles pour savoir où en est réellement chaque affaire.</p></article>
          <article className="fpe-feature"><span className="fpe-feature-no">05</span><h3>Facturation électronique</h3><p>Un espace de préparation dédié est déjà intégré pour accompagner progressivement les nouvelles obligations.</p></article>
        </div>
      </section>

      <section className="fpe-control" id="confiance">
        <div className="fpe-control-copy">
          <span>LA DIFFÉRENCE FORGEO</span>
          <h2>Ce que vous n'avez pas dit<br />n'est pas inventé.</h2>
          <p>Un logiciel métier doit vous faire gagner du temps sans décider à votre place. Si une quantité, un prix, une unité ou une TVA manque, FORGEO le signale au lieu de fabriquer une valeur crédible mais fausse.</p>
          <div className="fpe-control-points"><span>✓ Prix dicté : conservé</span><span>✓ Prix absent : à préciser</span><span>✓ Modification : toujours visible avant envoi</span></div>
        </div>
        <div className="fpe-control-card">
          <small>POSTE À VÉRIFIER</small>
          <strong>Protection et préparation du chantier</strong>
          <div><span>Quantité</span><b>À préciser</b></div>
          <div><span>Unité</span><b>À préciser</b></div>
          <div><span>Prix unitaire</span><b>À préciser</b></div>
          <p>Rien n'est transformé en « 1 forfait · 0,00 € » juste pour remplir le document.</p>
        </div>
      </section>

      <section className="fpe-security" id="securite">
        <div><span>SÉCURITÉ</span><h2>Les données de votre entreprise restent dans votre espace.</h2></div>
        <div className="fpe-security-grid">
          <article><b>Entreprise séparée</b><p>Clients, devis, factures et espace de travail sont rattachés à votre entreprise et protégés par des règles d'accès dédiées.</p></article>
          <article><b>Synchronisation sécurisée</b><p>Vos données de travail sont synchronisées dans le cloud et le cache local sensible est nettoyé lors d'une déconnexion réussie.</p></article>
          <article><b>Contrôle humain</b><p>FORGEO prépare et accélère. L'artisan garde la validation finale sur les informations métier et les prix.</p></article>
        </div>
      </section>

      <section className="fpe-final-cta">
        <div><span>PILOTE FORGEO</span><h2>La gestion qui suit votre façon de travailler, pas l'inverse.</h2><p>Créez votre espace entreprise et commencez avec vos vrais clients et vos vrais devis.</p></div>
        <button type="button" className="fpe-primary fpe-primary-light" onClick={onSignup}>Créer mon espace <span>→</span></button>
      </section>

      <footer className="fpe-footer"><a href="#top" className="fpe-logo"><BrandMark /><span>FORGEO</span></a><p>Gestion métier pour artisans du bâtiment.</p><button type="button" onClick={onLogin}>Connexion</button></footer>
      <PublicEntryStyles />
    </main>
  );
}

function PublicEntryStyles() {
  return <style>{`
    :root{--fpe-green:#102922;--fpe-green-2:#173a31;--fpe-ink:#12211d;--fpe-cream:#f5f0e4;--fpe-paper:#fbf8f1;--fpe-orange:#e66b37;--fpe-line:#d8d3c7}.fpe-shell{min-height:100dvh;background:var(--fpe-paper);color:var(--fpe-ink);font-family:Arial,Helvetica,sans-serif;overflow-x:hidden}.fpe-announcement{min-height:31px;display:grid;place-items:center;padding:4px 16px;background:var(--fpe-green);color:#f8f3e8;font-size:10px;font-weight:800;letter-spacing:.08em;text-align:center}.fpe-nav{height:76px;max-width:1220px;margin:auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid rgba(16,41,34,.12)}.fpe-logo{display:inline-flex;align-items:center;gap:10px;color:var(--fpe-green);font-size:20px;font-weight:950;letter-spacing:.08em;text-decoration:none}.fpe-mark{width:34px;height:34px;display:inline-grid;color:var(--fpe-green)}.fpe-mark svg{width:100%;height:100%}.fpe-navlinks{display:flex;align-items:center;gap:28px}.fpe-navlinks a{color:#53615d;text-decoration:none;font-size:12px;font-weight:800}.fpe-navactions{display:flex;align-items:center;gap:9px}.fpe-link-button,.fpe-small-cta,.fpe-primary,.fpe-secondary,.fpe-footer button{font:800 12px Arial,sans-serif;cursor:pointer}.fpe-link-button{border:0;background:transparent;color:var(--fpe-green);padding:10px}.fpe-small-cta{border:0;border-radius:9px;background:var(--fpe-green);color:#fff;padding:11px 15px}.fpe-hero{max-width:1220px;margin:auto;min-height:660px;padding:76px 28px 72px;display:grid;grid-template-columns:minmax(0,1fr) minmax(440px,.95fr);gap:70px;align-items:center}.fpe-hero-copy{display:grid;justify-items:start}.fpe-kicker{display:inline-flex;align-items:center;gap:8px;margin-bottom:24px;color:#52645e;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.fpe-kicker span{color:var(--fpe-orange)}.fpe-hero h1{margin:0;max-width:720px;font-size:clamp(46px,6vw,77px);line-height:.96;letter-spacing:-.055em;color:var(--fpe-green);font-weight:900}.fpe-hero h1 em{color:var(--fpe-orange);font-style:normal}.fpe-lead{max-width:600px;margin:27px 0 0;color:#53615d;font-size:18px;line-height:1.55}.fpe-hero-actions{display:flex;gap:11px;flex-wrap:wrap;margin-top:31px}.fpe-primary{min-height:50px;padding:0 20px;border:0;border-radius:10px;background:var(--fpe-green);color:#fff;display:inline-flex;align-items:center;gap:14px;box-shadow:0 12px 30px rgba(16,41,34,.17)}.fpe-primary span{font-size:18px}.fpe-secondary{min-height:50px;padding:0 18px;border:1px solid #cfc9bc;border-radius:10px;background:#fff;color:var(--fpe-green)}.fpe-trust-row{display:flex;flex-wrap:wrap;gap:12px 22px;margin-top:24px;color:#6b7773;font-size:10.5px;font-weight:800}.fpe-hero-visual{position:relative;padding:34px 0 28px}.fpe-hero-visual:before{content:"";position:absolute;width:340px;height:340px;border-radius:50%;right:-50px;top:-10px;background:#eadfca;opacity:.65}.fpe-visual-label{position:absolute;z-index:2;top:0;right:0;padding:8px 10px;border:1px solid #d8d0c0;border-radius:999px;background:#fbf8f1;color:#68746f;font-size:8px;font-weight:900;letter-spacing:.12em}.fpe-product-card{position:relative;z-index:1;max-width:500px;margin-left:auto;border:1px solid #d6d0c3;border-radius:19px;background:#fff;box-shadow:0 28px 70px rgba(28,41,36,.14);overflow:hidden}.fpe-product-topbar{height:55px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;background:var(--fpe-green);color:#fff}.fpe-product-brand{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:950;letter-spacing:.08em}.fpe-product-brand .fpe-mark{width:23px;height:23px;color:#18372f}.fpe-product-status{padding:5px 8px;border-radius:999px;background:#f2d8a4;color:#6b4a0c;font-size:8px;font-weight:900}.fpe-product-heading{padding:22px 20px 17px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #ece7dd}.fpe-product-heading>div{display:grid;gap:3px}.fpe-product-heading small{font-size:8px;color:#818b87;font-weight:900;letter-spacing:.1em}.fpe-product-heading strong{font-size:18px;color:var(--fpe-green)}.fpe-product-heading span{font-size:10px;color:#6d7874}.fpe-product-heading>b{font-size:9px;color:#78847f}.fpe-product-lines{display:grid;padding:4px 20px}.fpe-product-lines>div{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid #eee9df}.fpe-product-lines span{font-size:10.5px;font-weight:800;color:#273b34}.fpe-product-lines strong{font-size:9px;color:#66736e}.fpe-product-lines b{min-width:80px;text-align:right;font-size:9px;color:var(--fpe-green)}.fpe-product-lines>div:nth-child(1) b,.fpe-product-lines>div:nth-child(3) b{color:#a24b28}.fpe-product-note{margin:14px 20px 18px;padding:10px 11px;display:flex;gap:8px;border-radius:10px;background:#f2f6f1;color:#466057}.fpe-product-note span{font-weight:950}.fpe-product-note p{margin:0;font-size:8.5px;line-height:1.45}.fpe-product-actions{padding:13px 20px;display:flex;justify-content:flex-end;gap:8px;background:#f7f4ed}.fpe-product-actions span{padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #ded8cc;font-size:8px;font-weight:900}.fpe-floating-card{position:absolute;z-index:2;left:-20px;bottom:-10px;width:210px;padding:14px;border-radius:13px;background:var(--fpe-orange);color:#fff;box-shadow:0 18px 38px rgba(126,60,28,.22);display:grid;gap:4px}.fpe-floating-card small{font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.84}.fpe-floating-card strong{font-size:13px}.fpe-floating-card span{font-size:9px;opacity:.9}.fpe-proof-strip{max-width:1220px;margin:auto;padding:0 28px 58px;display:grid;grid-template-columns:repeat(4,1fr);gap:0}.fpe-proof-strip>div{min-height:94px;padding:16px 19px;border-top:1px solid #d7d1c4;border-bottom:1px solid #d7d1c4;display:flex;gap:12px;align-items:center}.fpe-proof-strip>div+div{border-left:1px solid #d7d1c4}.fpe-proof-strip b{font-size:10px;color:var(--fpe-orange)}.fpe-proof-strip span{display:grid;gap:4px}.fpe-proof-strip strong{font-size:11px;color:var(--fpe-green)}.fpe-proof-strip small{font-size:9px;color:#74807b;line-height:1.35}.fpe-section{max-width:1220px;margin:auto;padding:82px 28px}.fpe-section-heading{max-width:800px;margin-bottom:38px}.fpe-section-heading span,.fpe-control-copy>span,.fpe-security>div>span,.fpe-final-cta>div>span{font-size:9px;color:var(--fpe-orange);font-weight:950;letter-spacing:.15em}.fpe-section-heading h2,.fpe-control h2,.fpe-security h2,.fpe-final-cta h2{margin:11px 0 0;color:var(--fpe-green);font-size:clamp(31px,4vw,48px);line-height:1.05;letter-spacing:-.035em}.fpe-feature-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.fpe-feature{position:relative;min-height:220px;padding:28px;border:1px solid #ddd7cb;border-radius:16px;background:#fff;overflow:hidden}.fpe-feature-large{grid-row:span 2;min-height:453px;background:var(--fpe-green);color:#fff}.fpe-feature-no{display:block;margin-bottom:45px;color:var(--fpe-orange);font-size:10px;font-weight:950}.fpe-feature h3{max-width:470px;margin:0;color:var(--fpe-green);font-size:22px;line-height:1.15;letter-spacing:-.02em}.fpe-feature p{max-width:520px;margin:14px 0 0;color:#65716d;font-size:12px;line-height:1.55}.fpe-feature-large h3{color:#fff;font-size:34px}.fpe-feature-large p{color:#c9d5d0;font-size:13px}.fpe-dictation{position:absolute;left:28px;right:28px;bottom:28px;padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.065);display:flex;gap:11px;align-items:center}.fpe-mic{width:34px;height:34px;border-radius:50%;background:var(--fpe-orange);display:grid;place-items:center;font-size:9px}.fpe-dictation div{display:grid;gap:3px}.fpe-dictation small{font-size:7px;color:#93aaa1;font-weight:900;letter-spacing:.12em}.fpe-dictation strong{font-size:10px;line-height:1.4}.fpe-control{max-width:1164px;margin:40px auto 90px;padding:58px;display:grid;grid-template-columns:1fr .8fr;gap:64px;align-items:center;border-radius:24px;background:#ebe3d3}.fpe-control-copy p{max-width:570px;margin:20px 0;color:#596660;font-size:13px;line-height:1.65}.fpe-control-points{display:grid;gap:8px;color:#2d4a40;font-size:10.5px;font-weight:850}.fpe-control-card{padding:23px;border:1px solid #cfc3ae;border-radius:16px;background:#fff;box-shadow:0 20px 40px rgba(56,48,37,.08)}.fpe-control-card>small{font-size:8px;color:var(--fpe-orange);font-weight:950;letter-spacing:.11em}.fpe-control-card>strong{display:block;margin:8px 0 17px;color:var(--fpe-green);font-size:17px}.fpe-control-card>div{padding:11px 0;display:flex;justify-content:space-between;border-top:1px solid #eee8dc;font-size:10px}.fpe-control-card>div span{color:#6f7975}.fpe-control-card>div b{color:#a24b28}.fpe-control-card p{margin:14px 0 0;padding:10px;border-radius:9px;background:#f8f2e8;color:#675c4d;font-size:9px;line-height:1.5}.fpe-security{max-width:1220px;margin:auto;padding:80px 28px 95px}.fpe-security>div:first-child{max-width:760px}.fpe-security-grid{margin-top:37px;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #d7d1c4;border-bottom:1px solid #d7d1c4}.fpe-security-grid article{padding:25px 24px}.fpe-security-grid article+article{border-left:1px solid #d7d1c4}.fpe-security-grid b{font-size:13px;color:var(--fpe-green)}.fpe-security-grid p{margin:11px 0 0;font-size:10px;color:#68736f;line-height:1.55}.fpe-final-cta{max-width:1164px;margin:0 auto 72px;padding:53px 58px;border-radius:22px;background:var(--fpe-green);color:#fff;display:flex;align-items:end;justify-content:space-between;gap:36px}.fpe-final-cta h2{max-width:720px;color:#fff}.fpe-final-cta p{margin:15px 0 0;color:#becdc7;font-size:12px}.fpe-primary-light{background:#f6efe1;color:var(--fpe-green);box-shadow:none;white-space:nowrap}.fpe-footer{max-width:1220px;margin:auto;padding:28px;display:flex;align-items:center;gap:22px;border-top:1px solid #d7d1c4}.fpe-footer p{margin:0;color:#78827e;font-size:10px}.fpe-footer button{margin-left:auto;border:0;background:transparent;color:var(--fpe-green)}@media(max-width:900px){.fpe-navlinks{display:none}.fpe-hero{grid-template-columns:1fr;gap:35px;padding-top:55px}.fpe-hero-copy{justify-items:center;text-align:center}.fpe-lead{max-width:650px}.fpe-trust-row{justify-content:center}.fpe-hero-visual{width:min(600px,100%);margin:auto}.fpe-product-card{margin:auto}.fpe-proof-strip{grid-template-columns:repeat(2,1fr)}.fpe-proof-strip>div:nth-child(3){border-left:0}.fpe-control{margin-left:20px;margin-right:20px;grid-template-columns:1fr;padding:40px}.fpe-security-grid{grid-template-columns:1fr}.fpe-security-grid article+article{border-left:0;border-top:1px solid #d7d1c4}.fpe-final-cta{margin-left:20px;margin-right:20px;align-items:flex-start;flex-direction:column}}@media(max-width:620px){.fpe-announcement{font-size:8px}.fpe-nav{height:64px;padding:0 17px}.fpe-logo{font-size:17px}.fpe-logo .fpe-mark{width:30px;height:30px}.fpe-navactions .fpe-small-cta{display:none}.fpe-hero{min-height:0;padding:48px 18px 55px}.fpe-kicker{margin-bottom:17px;font-size:8px}.fpe-hero h1{font-size:46px}.fpe-lead{font-size:15px}.fpe-hero-actions{width:100%;display:grid}.fpe-primary,.fpe-secondary{width:100%;justify-content:center}.fpe-trust-row{display:grid;justify-items:start;text-align:left;width:100%}.fpe-visual-label{display:none}.fpe-hero-visual{padding-top:5px}.fpe-product-heading{padding:17px 14px 13px}.fpe-product-lines{padding:4px 14px}.fpe-product-lines>div{grid-template-columns:1fr auto;gap:5px}.fpe-product-lines>div>b{grid-column:1/-1;text-align:left}.fpe-product-note{margin:12px 14px}.fpe-floating-card{position:relative;left:auto;bottom:auto;width:auto;margin:-8px 14px 0}.fpe-proof-strip{padding:0 18px 45px;grid-template-columns:1fr}.fpe-proof-strip>div+div{border-left:0;border-top:0}.fpe-section{padding:62px 18px}.fpe-section-heading h2{font-size:34px}.fpe-feature-grid{grid-template-columns:1fr}.fpe-feature-large{grid-row:auto;min-height:430px}.fpe-feature{padding:22px}.fpe-feature-no{margin-bottom:30px}.fpe-feature-large h3{font-size:28px}.fpe-dictation{left:22px;right:22px;bottom:22px}.fpe-control{margin:10px 12px 60px;padding:30px 22px;gap:34px}.fpe-control h2{font-size:34px}.fpe-security{padding:60px 18px}.fpe-security h2{font-size:34px}.fpe-final-cta{margin:0 12px 45px;padding:34px 24px}.fpe-final-cta h2{font-size:33px}.fpe-footer{padding:22px 18px}.fpe-footer p{display:none}}
  `}</style>;
}
