"use client";

import type { FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  FileCheck2,
  FileText,
  HardHat,
  LockKeyhole,
  Mic2,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

export type ForgeoPublicView = "landing" | "login" | "signup";

type Props = {
  view: ForgeoPublicView;
  companyName: string;
  email: string;
  password: string;
  authBusy: boolean;
  authMessage: string;
  onNavigate: (view: ForgeoPublicView) => void;
  onCompanyNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const benefits = [
  [ShieldCheck, "Données isolées par entreprise", "Chaque entreprise travaille dans son propre espace."],
  [FileCheck2, "Pas de chiffre inventé", "Une quantité ou un prix inconnu reste clairement à préciser."],
  [HardHat, "Pensé pour le terrain", "Le même espace sur téléphone et sur ordinateur."],
] as const;

const features = [
  [FileText, "Devis et factures", "Préparez, corrigez, envoyez puis transformez vos devis sans ressaisie inutile."],
  [Mic2, "Dictée chantier", "Décrivez les travaux à voix haute et récupérez un brouillon structuré à vérifier."],
  [TrendingUp, "Rentabilité", "Suivez les coûts réels et la marge de vos chantiers depuis le même dossier."],
  [Users, "Clients et chantiers", "Coordonnées, documents, statuts et historique restent attachés au bon client."],
  [CalendarDays, "Agenda", "Planifiez rendez-vous, interventions et relances sans changer d’outil."],
  [ReceiptText, "Facturation électronique", "Préparez progressivement vos flux de facturation électronique dans FORGEO."],
] as const;

function Brand() {
  return (
    <div className="fp-brand" aria-label="FORGEO">
      <span className="fp-mark" aria-hidden="true"><i /></span>
      <strong>FORGEO</strong>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="fp-product" aria-label="Aperçu de FORGEO">
      <div className="fp-product-top"><span>Atelier Martin</span><small>Synchronisé</small></div>
      <div className="fp-product-body">
        <aside><b>Vue d’ensemble</b><span className="active">Devis</span><span>Factures</span><span>Clients</span><span>Agenda</span></aside>
        <section>
          <header><div><small>DEVIS EN COURS</small><strong>3 dossiers à suivre</strong></div><em>+ Nouveau devis</em></header>
          <div className="fp-stats"><span><small>À envoyer</small><b>2</b></span><span><small>Acceptés</small><b>5</b></span><span><small>À facturer</small><b>3 420 €</b></span></div>
          <article>
            <div className="fp-doc-head"><div><small>DEV-2026-041</small><strong>Rénovation séjour · M. Morel</strong></div><mark>À vérifier</mark></div>
            <div className="fp-line"><span>Préparation des murs</span><b>42 m²</b><em>28 €/m²</em></div>
            <div className="fp-line"><span>Peinture des plinthes</span><b>À préciser</b><em>À préciser</em></div>
            <div className="fp-dictation"><Mic2 size={14}/><span>« Peinture séjour, 42 m²… »</span><b>Brouillon préparé</b></div>
          </article>
        </section>
      </div>
    </div>
  );
}

function Landing({ onNavigate }: Pick<Props, "onNavigate">) {
  return (
    <main className="fp-root">
      <header className="fp-nav">
        <Brand />
        <nav><a href="#terrain">Pour le terrain</a><a href="#fonctions">Fonctionnalités</a><a href="#confiance">Confiance</a></nav>
        <div><button className="fp-login-link" onClick={() => onNavigate("login")}>Connexion</button><button className="fp-mini" onClick={() => onNavigate("signup")}>Créer mon espace</button></div>
      </header>

      <section className="fp-hero">
        <div className="fp-hero-copy">
          <span className="fp-kicker"><HardHat size={15}/> Gestion d’entreprise pour artisans du bâtiment</span>
          <h1>Le bureau de votre entreprise, sans y passer vos soirées.</h1>
          <p>Devis, factures, clients, agenda et rentabilité réunis dans un outil simple à utiliser sur chantier comme au bureau.</p>
          <div className="fp-actions"><button className="fp-primary" onClick={() => onNavigate("signup")}>Créer mon espace <ArrowRight size={17}/></button><a href="#terrain">Voir comment ça marche</a></div>
          <div className="fp-proof"><span><Check size={14}/> Vos prix restent sous votre contrôle</span><span><Check size={14}/> Données isolées par entreprise</span><span><Check size={14}/> Mobile et ordinateur</span></div>
        </div>
        <ProductPreview />
      </section>

      <section className="fp-strip">
        <div><b>Devis → facture</b><span>sans ressaisie inutile</span></div>
        <div><b>Chantier → brouillon</b><span>par dictée ou saisie classique</span></div>
        <div><b>Prix manquant</b><span>reste clairement « À préciser »</span></div>
        <div><b>Entreprise</b><span>données et documents séparés</span></div>
      </section>

      <section className="fp-section" id="confiance">
        <div className="fp-heading"><span>CONFIANCE D’ABORD</span><h2>Un logiciel métier doit vous faire gagner du temps, pas décider à votre place.</h2><p>FORGEO automatise la préparation, mais garde visibles les informations à vérifier avant qu’un document parte chez le client.</p></div>
        <div className="fp-benefits">{benefits.map(([Icon,title,text]) => <article key={title}><Icon size={22}/><strong>{title}</strong><p>{text}</p></article>)}</div>
      </section>

      <section className="fp-section fp-terrain" id="terrain">
        <div><span className="fp-label">SUR CHANTIER</span><h2>Vous parlez travaux. FORGEO prépare le bureau.</h2><p>Dictez les prestations, quantités et prix que vous connaissez. Le brouillon est structuré, les inconnues restent visibles, puis vous validez.</p><ul><li><Check size={16}/> Un prix déjà renseigné n’est pas écrasé.</li><li><Check size={16}/> Une donnée manquante n’est pas transformée en faux forfait.</li><li><Check size={16}/> Des repères de prix sourcés peuvent être consultés avant décision.</li></ul></div>
        <ProductPreview />
      </section>

      <section className="fp-section" id="fonctions">
        <div className="fp-heading compact"><span>L’ESSENTIEL AU MÊME ENDROIT</span><h2>Moins d’outils à ouvrir. Moins de choses à ressaisir.</h2></div>
        <div className="fp-features">{features.map(([Icon,title,text]) => <article key={title}><Icon size={21}/><strong>{title}</strong><p>{text}</p></article>)}</div>
      </section>

      <section className="fp-cta"><div><span>FORGEO POUR VOTRE ENTREPRISE</span><h2>Commencez avec vos vrais clients et vos vrais devis.</h2><p>Créez votre espace entreprise puis retrouvez vos dossiers depuis votre téléphone ou votre ordinateur.</p></div><button onClick={() => onNavigate("signup")}>Créer mon espace <ArrowRight size={17}/></button></section>
      <footer><Brand/><p>Gestion de devis, factures et chantiers pour artisans.</p><button onClick={() => onNavigate("login")}>Se connecter</button></footer>
      <Styles />
    </main>
  );
}

function AuthPage(props: Props) {
  const signup = props.view === "signup";
  return (
    <main className="fp-auth">
      <aside>
        <button className="fp-back" onClick={() => props.onNavigate("landing")}>← Retour</button>
        <Brand />
        <div className="fp-auth-copy"><span>ESPACE ENTREPRISE</span><h1>{signup ? "Votre gestion chantier commence ici." : "Retrouvez votre entreprise."}</h1><p>{signup ? "Créez un espace séparé pour vos clients, devis, factures et chantiers." : "Connectez-vous pour retrouver les données synchronisées de votre entreprise."}</p></div>
        <div className="fp-assurances"><span><LockKeyhole size={17}/><b>Données isolées</b><small>Votre entreprise ne voit que son espace.</small></span><span><FileCheck2 size={17}/><b>Valeurs sous contrôle</b><small>Ce qui manque reste à vérifier.</small></span><span><HardHat size={17}/><b>Fait pour le quotidien</b><small>Chantier et bureau dans le même outil.</small></span></div>
      </aside>
      <section className="fp-auth-main">
        <div className="fp-auth-card" role="dialog" aria-label={signup ? "Création de compte FORGEO" : "Connexion FORGEO"}>
          <header><span>{signup ? "CRÉATION DE COMPTE" : "CONNEXION"}</span><h2>{signup ? "Créez votre espace FORGEO" : "Bon retour sur FORGEO"}</h2><p>{signup ? "Trois informations suffisent pour ouvrir votre espace entreprise." : "Saisissez les identifiants liés à votre entreprise."}</p></header>
          <form onSubmit={props.onSubmit}>
            {signup && <label>Nom de l’entreprise<input autoFocus autoComplete="organization" value={props.companyName} onChange={e => props.onCompanyNameChange(e.target.value)} placeholder="Ex. Martin Rénovation"/></label>}
            <label>Adresse e-mail<input autoFocus={!signup} type="email" autoComplete="email" value={props.email} onChange={e => props.onEmailChange(e.target.value)} placeholder="contact@entreprise.fr"/></label>
            <label>Mot de passe<input type="password" minLength={8} autoComplete={signup ? "new-password" : "current-password"} value={props.password} onChange={e => props.onPasswordChange(e.target.value)} placeholder="8 caractères minimum"/></label>
            <button type="submit" disabled={props.authBusy}>{props.authBusy ? (signup ? "Création de l’espace…" : "Connexion…") : (signup ? "Créer mon espace entreprise" : "Se connecter")}</button>
          </form>
          {props.authMessage && <p className="fp-message" aria-live="polite">{props.authMessage}</p>}
          <div className="fp-switch"><span>{signup ? "Vous avez déjà un compte ?" : "Première fois sur FORGEO ?"}</span><button onClick={() => props.onNavigate(signup ? "login" : "signup")}>{signup ? "Se connecter" : "Créer un espace"}</button></div>
          <small className="fp-note">Les données de votre entreprise sont synchronisées dans un espace dédié après connexion.</small>
        </div>
      </section>
      <Styles />
    </main>
  );
}

function Styles() {
  return <style>{`
    :root{--ink:#102a3d;--dark:#0b2232;--paper:#f3efe6;--card:#fffdf8;--orange:#c95f2c;--green:#2f6d55;--line:#d9d2c5;--muted:#68757c}
    .fp-root,.fp-auth{min-height:100dvh;color:var(--ink);background:var(--paper);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.fp-root *,.fp-auth *{box-sizing:border-box}.fp-root button,.fp-auth button,.fp-auth input{font:inherit}.fp-root button,.fp-auth button{cursor:pointer}.fp-brand{display:flex;align-items:center;gap:9px}.fp-brand strong{font-size:18px;font-weight:950;letter-spacing:.08em}.fp-mark{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:var(--dark)}.fp-mark i{width:13px;height:15px;border-left:4px solid #f5efe3;border-bottom:4px solid #f5efe3;transform:skew(-18deg) rotate(-45deg)}
    .fp-nav{position:sticky;top:0;z-index:30;max-width:1180px;height:74px;margin:auto;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:0 28px;background:rgba(243,239,230,.94);backdrop-filter:blur(14px);border-bottom:1px solid rgba(217,210,197,.75)}.fp-nav nav{display:flex;justify-content:center;gap:26px}.fp-nav a{color:#45565f;text-decoration:none;font-size:12px;font-weight:800}.fp-nav>div:last-child{display:flex;gap:8px}.fp-login-link{border:0;background:transparent;color:var(--ink);font-weight:900}.fp-mini,.fp-primary,.fp-auth form>button{border:0;border-radius:10px;background:var(--orange);color:#fff;font-weight:900}.fp-mini{height:40px;padding:0 15px;font-size:12px}
    .fp-hero{max-width:1180px;margin:auto;display:grid;grid-template-columns:minmax(0,.9fr) minmax(470px,1.1fr);align-items:center;gap:50px;padding:82px 28px 68px}.fp-kicker,.fp-label{display:inline-flex;align-items:center;gap:7px;color:var(--green);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.fp-hero h1{max-width:650px;margin:18px 0 0;color:var(--dark);font-size:clamp(44px,5.2vw,70px);line-height:1;letter-spacing:-.055em}.fp-hero-copy>p{max-width:590px;margin:23px 0 0;color:#596970;font-size:17px;line-height:1.55}.fp-actions{display:flex;gap:11px;margin-top:30px}.fp-primary{min-height:50px;display:inline-flex;align-items:center;gap:8px;padding:0 19px;font-size:13px}.fp-actions>a{min-height:50px;display:flex;align-items:center;padding:0 17px;border:1px solid #cec6b8;border-radius:10px;color:var(--ink);text-decoration:none;font-size:12px;font-weight:900}.fp-proof{display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:24px}.fp-proof span{display:flex;align-items:center;gap:5px;color:#55656d;font-size:10px;font-weight:800}.fp-proof svg{color:var(--green)}
    .fp-product{overflow:hidden;border:1px solid #bfc7c5;border-radius:15px;background:#fff;box-shadow:0 26px 65px rgba(29,46,55,.16);transform:rotate(.6deg)}.fp-product-top{height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;color:#dfe8ea;background:var(--dark);font-size:9px}.fp-product-top small{color:#86bd9e}.fp-product-body{min-height:365px;display:grid;grid-template-columns:115px 1fr}.fp-product aside{display:grid;align-content:start;gap:4px;padding:16px 10px;background:#eef1ed}.fp-product aside b{margin-bottom:8px;font-size:8px}.fp-product aside span{padding:8px;border-radius:7px;color:#657279;font-size:8px;font-weight:800}.fp-product aside span.active{color:#fff;background:var(--dark)}.fp-product-body>section{padding:16px;background:#f8f7f2}.fp-product-body section>header{display:flex;align-items:center;justify-content:space-between;gap:8px}.fp-product-body section>header div{display:grid;gap:3px}.fp-product-body section>header small{font-size:7px;color:#7a888e;font-weight:900}.fp-product-body section>header strong{font-size:14px}.fp-product-body section>header em{padding:8px;border-radius:7px;color:#fff;background:var(--orange);font-size:7px;font-style:normal;font-weight:900}.fp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:13px 0}.fp-stats span{display:grid;gap:4px;padding:9px;border:1px solid #dfe3dd;border-radius:9px;background:#fff}.fp-stats small{font-size:7px;color:#7a878d}.fp-stats b{font-size:13px}.fp-product article{overflow:hidden;border:1px solid #dce1dd;border-radius:10px;background:#fff}.fp-doc-head{display:flex;justify-content:space-between;gap:8px;padding:11px;border-bottom:1px solid #e7eae6}.fp-doc-head>div{display:grid;gap:2px}.fp-doc-head small{font-size:7px;color:#7c898e}.fp-doc-head strong{font-size:10px}.fp-doc-head mark{height:max-content;padding:4px 6px;border-radius:999px;color:#9e4820;background:#fff0e8;font-size:7px;font-weight:900}.fp-line{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:10px 11px;border-bottom:1px solid #edf0ed;font-size:8px}.fp-line em{min-width:48px;color:#657279;font-style:normal;text-align:right}.fp-dictation{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;margin:9px;padding:8px;border-radius:8px;color:#4d5c56;background:#edf3ef;font-size:7px}.fp-dictation svg,.fp-dictation b{color:var(--green)}
    .fp-strip{max-width:1180px;margin:0 auto 30px;display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden;border:1px solid var(--line);border-radius:13px;background:var(--card)}.fp-strip div{display:grid;gap:4px;padding:20px;border-right:1px solid var(--line)}.fp-strip div:last-child{border:0}.fp-strip b{font-size:12px}.fp-strip span{color:#7b8589;font-size:9px}.fp-section{max-width:1180px;margin:auto;padding:84px 28px}.fp-heading{max-width:780px;display:grid;gap:11px;margin-bottom:32px}.fp-heading.compact{max-width:680px}.fp-heading>span,.fp-cta>div>span,.fp-auth-copy>span,.fp-auth-card>header>span{color:var(--orange);font-size:9px;font-weight:950;letter-spacing:.13em}.fp-heading h2,.fp-terrain h2,.fp-cta h2{margin:0;color:var(--dark);font-size:clamp(30px,4vw,46px);line-height:1.07;letter-spacing:-.04em}.fp-heading p,.fp-terrain>div>p{margin:0;color:#65737a;font-size:14px;line-height:1.6}.fp-benefits,.fp-features{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.fp-benefits article,.fp-features article{display:grid;align-content:start;gap:9px;padding:21px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.fp-benefits svg,.fp-features svg{color:var(--orange)}.fp-benefits strong,.fp-features strong{font-size:13px}.fp-benefits p,.fp-features p{margin:0;color:#6c787e;font-size:11px;line-height:1.55}.fp-terrain{display:grid;grid-template-columns:minmax(0,.8fr) minmax(430px,1.2fr);align-items:center;gap:50px;border-top:1px solid var(--line)}.fp-terrain ul{display:grid;gap:9px;padding:0;margin:22px 0 0;list-style:none}.fp-terrain li{display:flex;align-items:flex-start;gap:7px;color:#526169;font-size:11px;line-height:1.45}.fp-terrain li svg{flex:0 0 auto;color:var(--green)}.fp-cta{max-width:1124px;margin:30px auto 70px;display:flex;align-items:center;justify-content:space-between;gap:35px;padding:42px;border-radius:17px;color:#f3eee4;background:var(--dark)}.fp-cta>div{max-width:680px;display:grid;gap:9px}.fp-cta h2{color:#fff}.fp-cta p{margin:0;color:#b8c3c7;font-size:12px}.fp-cta>button{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:14px 17px;border:0;border-radius:9px;color:var(--dark);background:#f2e8d6;font-weight:900}.fp-root>footer{max-width:1180px;margin:auto;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;padding:26px 28px;border-top:1px solid var(--line)}.fp-root>footer p{color:#7c8589;font-size:9px}.fp-root>footer button{border:0;background:transparent;color:var(--ink);font-size:10px;font-weight:900}
    .fp-auth{display:grid;grid-template-columns:minmax(380px,.9fr) minmax(500px,1.1fr);background:#fff}.fp-auth>aside{min-height:100dvh;display:grid;grid-template-rows:auto auto 1fr auto;padding:32px clamp(30px,5vw,72px);color:#f5efe4;background:var(--dark)}.fp-auth>aside .fp-brand{margin-top:50px}.fp-auth>aside .fp-mark{background:#f5efe4}.fp-auth>aside .fp-mark i{border-color:var(--dark)}.fp-back{justify-self:start;border:0;background:transparent;color:#b7c2c7;font-size:10px;font-weight:850}.fp-auth-copy{align-self:center;display:grid;gap:12px;padding:55px 0}.fp-auth-copy h1{margin:0;color:#fff;font-size:clamp(38px,4vw,56px);line-height:1.02;letter-spacing:-.05em}.fp-auth-copy p{margin:0;color:#b9c4c8;font-size:13px;line-height:1.6}.fp-assurances{display:grid;gap:10px;padding-top:20px;border-top:1px solid rgba(255,255,255,.15)}.fp-assurances span{display:grid;grid-template-columns:auto 1fr;gap:2px 8px}.fp-assurances svg{grid-row:1/3;color:#e39a74}.fp-assurances b{font-size:10px}.fp-assurances small{color:#9caab0;font-size:8px}.fp-auth-main{min-height:100dvh;display:grid;place-items:center;padding:38px;background:#f5f1e9}.fp-auth-card{width:min(450px,100%);display:grid;gap:21px;padding:32px;border:1px solid #ddd7ca;border-radius:15px;background:#fff;box-shadow:0 20px 55px rgba(35,43,46,.1)}.fp-auth-card>header{display:grid;gap:7px}.fp-auth-card h2{margin:0;color:var(--dark);font-size:29px;letter-spacing:-.035em}.fp-auth-card header p{margin:0;color:#748087;font-size:11px;line-height:1.5}.fp-auth-card form{display:grid;gap:13px}.fp-auth-card label{display:grid;gap:6px;color:#344a56;font-size:9px;font-weight:900}.fp-auth-card input{height:47px;border:1px solid #d7d6d0;border-radius:9px;padding:0 12px;outline:0;color:#172d3c;background:#fffdf9;font-size:12px}.fp-auth-card input:focus{border-color:#a36649;box-shadow:0 0 0 3px rgba(201,95,44,.11)}.fp-auth-card form>button{min-height:48px;margin-top:2px;font-size:11px}.fp-auth-card form>button:disabled{opacity:.6;cursor:wait}.fp-message{margin:0;padding:10px 11px;border-left:3px solid var(--orange);border-radius:7px;color:#715140;background:#f7efe9;font-size:10px}.fp-switch{display:flex;justify-content:space-between;gap:10px;padding-top:5px;border-top:1px solid #ece8df;color:#778187;font-size:9px}.fp-switch button{border:0;background:transparent;color:var(--ink);font-size:9px;font-weight:900}.fp-note{color:#92999d;font-size:8px;line-height:1.5}
    @media(max-width:900px){.fp-nav{grid-template-columns:1fr auto;height:66px;padding:0 18px}.fp-nav nav{display:none}.fp-login-link{display:none}.fp-hero{grid-template-columns:1fr;gap:38px;padding:54px 18px}.fp-strip{margin:0 18px;grid-template-columns:1fr 1fr}.fp-strip div:nth-child(2){border-right:0}.fp-strip div:nth-child(-n+2){border-bottom:1px solid var(--line)}.fp-section{padding:64px 18px}.fp-benefits,.fp-features{grid-template-columns:1fr 1fr}.fp-terrain{grid-template-columns:1fr}.fp-cta{margin:25px 18px 52px;align-items:flex-start;flex-direction:column}.fp-auth{grid-template-columns:1fr}.fp-auth>aside{min-height:auto;grid-template-columns:auto 1fr;grid-template-rows:auto auto;padding:22px}.fp-auth>aside .fp-brand{margin:0;justify-self:end}.fp-auth-copy{grid-column:1/-1;padding:45px 0 24px}.fp-assurances{grid-column:1/-1;grid-template-columns:repeat(3,1fr)}.fp-auth-main{min-height:auto;padding:30px 18px 48px}}
    @media(max-width:620px){.fp-hero h1{font-size:44px}.fp-hero-copy>p{font-size:15px}.fp-actions{flex-direction:column;align-items:stretch}.fp-primary,.fp-actions>a{justify-content:center}.fp-proof{display:grid}.fp-product-body{grid-template-columns:1fr;min-height:340px}.fp-product aside{display:none}.fp-stats{grid-template-columns:1fr 1fr}.fp-stats span:last-child{grid-column:1/-1}.fp-line{grid-template-columns:1fr auto}.fp-line em{grid-column:1/-1;text-align:left}.fp-strip{grid-template-columns:1fr}.fp-strip div{border-right:0;border-bottom:1px solid var(--line)!important}.fp-strip div:last-child{border-bottom:0!important}.fp-benefits,.fp-features{grid-template-columns:1fr}.fp-cta{padding:28px 22px}.fp-root>footer{grid-template-columns:1fr auto;padding:24px 18px}.fp-root>footer p{grid-column:1/-1}.fp-auth>aside{padding:18px}.fp-auth-copy h1{font-size:39px}.fp-assurances{grid-template-columns:1fr}.fp-auth-card{padding:26px 20px}.fp-switch{align-items:flex-start;flex-direction:column}}
  `}</style>;
}

export default function ForgeoPublicEntry(props: Props) {
  return props.view === "landing" ? <Landing onNavigate={props.onNavigate}/> : <AuthPage {...props}/>;
}
