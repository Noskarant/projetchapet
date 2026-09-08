"use client";

import type { Session } from "@supabase/supabase-js";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ensurePilotOrganization,
  loadPilotCloudSnapshot,
  savePilotCloudSnapshot,
  type PilotOrganization,
} from "@/lib/pilot-cloud";
import {
  clearPilotLocalSnapshot,
  markPilotSnapshotDirty,
  markPilotSnapshotSynced,
  pilotStorageSignature,
  readPilotLocalSnapshot,
  readPilotSyncState,
  shouldPreferLocalPilotSnapshot,
  writePilotLocalSnapshot,
} from "@/lib/pilot-cloud-workspace";
import ForgeoPublicEntry from "./forgeo-public-entry";

const AUTH_BYPASS = process.env.NEXT_PUBLIC_FORGEO_AUTH_BYPASS === "1";

type SyncStatus = "saved" | "saving" | "error";
type AuthMode = "login" | "signup";
type PublicView = "landing" | "auth";

function LoadingScreen({ label = "Sécurisation de votre espace…" }: { label?: string }) {
  return (
    <main className="forgeo-auth-screen" aria-label="Chargement sécurisé FORGEO">
      <div className="forgeo-auth-loading">
        <span className="forgeo-auth-loading-mark">F</span>
        <strong>{label}</strong>
      </div>
      <AuthStyles />
    </main>
  );
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirme d’abord ton adresse e-mail.";
  if (/user already registered/i.test(message)) return "Un compte existe déjà avec cette adresse e-mail.";
  if (/password/i.test(message) && /least|short|characters/i.test(message)) return "Utilise un mot de passe d’au moins 8 caractères.";
  return "Connexion impossible pour le moment. Réessaie.";
}

function AuthStyles() {
  return <style>{`
    .forgeo-auth-screen{min-height:100dvh;display:grid;place-items:center;padding:34px;background:#f7f3e9;color:#142721;font-family:Arial,Helvetica,sans-serif}.forgeo-auth-layout{width:min(1040px,100%);display:grid;grid-template-columns:minmax(0,.92fr) minmax(390px,.72fr);border:1px solid #d9d2c3;border-radius:24px;background:#fff;box-shadow:0 30px 80px rgba(32,45,39,.12);overflow:hidden}.forgeo-auth-aside{min-height:570px;padding:48px;display:flex;flex-direction:column;justify-content:space-between;background:#102922;color:#f8f2e5}.forgeo-auth-aside-top{display:grid;gap:12px}.forgeo-auth-logo{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:950;letter-spacing:.08em}.forgeo-auth-logo-mark{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#f4eedf;color:#102922;font-size:18px;font-weight:950}.forgeo-auth-aside h1{max-width:520px;margin:28px 0 0;font-size:43px;line-height:1.02;letter-spacing:-.045em}.forgeo-auth-aside p{max-width:480px;margin:15px 0 0;color:#becdc6;font-size:13px;line-height:1.6}.forgeo-auth-aside-points{display:grid;gap:10px}.forgeo-auth-aside-points span{display:flex;gap:9px;align-items:center;color:#dce5e1;font-size:11px;font-weight:750}.forgeo-auth-aside-points b{color:#ef7b48}.forgeo-auth-panel{padding:38px 40px;display:flex;flex-direction:column;justify-content:center}.forgeo-auth-back{align-self:flex-start;margin:0 0 24px;padding:0;border:0;background:transparent;color:#6a756f;font:800 10px Arial,sans-serif;cursor:pointer}.forgeo-auth-brand{display:grid;gap:7px}.forgeo-auth-brand span{font-size:9px;font-weight:950;letter-spacing:.15em;color:#e66b37}.forgeo-auth-brand h2{margin:0;font-size:28px;line-height:1.08;letter-spacing:-.035em;color:#102922}.forgeo-auth-brand p{margin:0;color:#6b7671;font-size:11px;line-height:1.5}.forgeo-auth-tabs{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;border:1px solid #ded8cc;border-radius:11px;background:#f6f2e9}.forgeo-auth-tabs button{height:38px;border:0;border-radius:8px;background:transparent;color:#78817e;font-weight:850;cursor:pointer}.forgeo-auth-tabs button.active{background:#fff;color:#102922;box-shadow:0 1px 5px rgba(30,43,37,.08)}.forgeo-auth-form{display:grid;gap:13px;margin-top:20px}.forgeo-auth-form label{display:grid;gap:6px;font-size:10px;font-weight:850;color:#40514a}.forgeo-auth-form input{box-sizing:border-box;width:100%;height:47px;border:1px solid #d8d2c6;border-radius:10px;padding:0 13px;background:#fff;color:#142721;font:650 14px Arial,sans-serif;outline:none}.forgeo-auth-form input::placeholder{color:#a0a7a3}.forgeo-auth-form input:focus{border-color:#527267;box-shadow:0 0 0 3px rgba(52,96,81,.1)}.forgeo-auth-primary{min-height:49px;border:0;border-radius:10px;background:#102922;color:#fff;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 12px 26px rgba(16,41,34,.15)}.forgeo-auth-primary:disabled{opacity:.55;cursor:default}.forgeo-auth-message{margin:13px 0 0;padding:10px 12px;border-radius:9px;background:#f3f6f2;color:#43574f;font-size:10.5px;line-height:1.45}.forgeo-auth-trust{margin:15px 0 0;padding-top:14px;border-top:1px solid #ece7dc;display:flex;gap:12px;flex-wrap:wrap;color:#7b8580;font-size:9px;font-weight:750}.forgeo-auth-loading{display:grid;gap:12px;justify-items:center;text-align:center}.forgeo-auth-loading-mark{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;background:#102922;color:#f4eedf;font-size:25px;font-weight:950}.forgeo-auth-loading strong{font-size:11px;color:#6c7772}.forgeo-auth-error{width:min(460px,100%);display:grid;gap:14px;padding:26px;border:1px solid #e0c8c0;border-radius:18px;background:#fff}.forgeo-auth-error h2{margin:0;color:#74341f;font-size:20px}.forgeo-auth-error p{margin:0;color:#75594f;font-size:12px;line-height:1.5}.forgeo-account-fallback{position:fixed;z-index:11900;right:16px;top:16px;height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(6,10,20,.9);color:#fff;font-weight:850;box-shadow:0 8px 22px rgba(0,0,0,.24)}.forgeo-account-backdrop{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;padding:18px;background:rgba(0,3,10,.68);backdrop-filter:blur(8px)}.forgeo-account-panel{width:min(410px,100%);display:grid;gap:14px;padding:20px;border:1px solid rgba(255,255,255,.11);border-radius:21px;background:#090f1d;color:#f8fafc;box-shadow:0 28px 80px rgba(0,0,0,.45)}.forgeo-account-panel header{display:flex;justify-content:space-between;gap:12px;align-items:start}.forgeo-account-panel header div{display:grid;gap:3px}.forgeo-account-panel header small{color:#8f9db2;font-size:10px;font-weight:900;letter-spacing:.12em}.forgeo-account-panel header strong{font-size:19px}.forgeo-account-panel header button{width:36px;height:36px;border:0;border-radius:11px;background:rgba(255,255,255,.08);color:#fff;font-size:20px}.forgeo-account-meta{display:grid;gap:7px;padding:12px;border-radius:13px;background:rgba(255,255,255,.055)}.forgeo-account-meta span{font-size:11px;color:#9cabbf}.forgeo-account-meta strong{font-size:13px;overflow-wrap:anywhere}.forgeo-account-sync{font-size:11px;font-weight:850}.forgeo-account-sync.saved{color:#75d6a3}.forgeo-account-sync.saving{color:#f4c76c}.forgeo-account-sync.error{color:#ff9b9b}.forgeo-account-signout{min-height:44px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(255,255,255,.065);color:#fff;font-weight:900}.forgeo-account-signout:disabled{opacity:.55}@media(max-width:820px){.forgeo-auth-screen{padding:17px}.forgeo-auth-layout{grid-template-columns:1fr;border-radius:19px}.forgeo-auth-aside{display:none}.forgeo-auth-panel{padding:27px 22px}.forgeo-auth-back{margin-bottom:20px}.forgeo-auth-brand h2{font-size:26px}.forgeo-account-fallback{display:none}.forgeo-account-backdrop{place-items:end center;padding:0}.forgeo-account-panel{width:100%;box-sizing:border-box;border-radius:22px 22px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom))}}
  `}</style>;
}

function RequiredPilotAuth({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<PilotOrganization | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [mode, setMode] = useState<AuthMode>("login");
  const [publicView, setPublicView] = useState<PublicView>("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("saved");
  const [accountOpen, setAccountOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const bootstrapRun = useRef(0);
  const lastSyncedSignature = useRef("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthMessage(friendlyAuthError(error.message));
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const run = ++bootstrapRun.current;

    if (!session?.user) {
      setOrganization(null);
      setWorkspaceReady(false);
      setBootstrapError("");
      return;
    }

    setWorkspaceReady(false);
    setBootstrapError("");
    setSyncStatus("saved");

    void (async () => {
      try {
        const nextOrganization = await ensurePilotOrganization(session.user.id);
        const localSnapshot = readPilotLocalSnapshot(window.localStorage);
        const syncState = readPilotSyncState(window.localStorage);
        const cloudSnapshot = await loadPilotCloudSnapshot(nextOrganization.id);
        if (run !== bootstrapRun.current) return;

        if (cloudSnapshot) {
          if (shouldPreferLocalPilotSnapshot(syncState, nextOrganization.id)) {
            await savePilotCloudSnapshot(nextOrganization.id, session.user.id, localSnapshot);
          } else {
            writePilotLocalSnapshot(window.localStorage, cloudSnapshot);
          }
        } else {
          await savePilotCloudSnapshot(nextOrganization.id, session.user.id, localSnapshot);
        }
        if (run !== bootstrapRun.current) return;

        const synchronizedSignature = pilotStorageSignature(window.localStorage);
        lastSyncedSignature.current = synchronizedSignature;
        markPilotSnapshotSynced(window.localStorage, nextOrganization.id, synchronizedSignature);
        setOrganization(nextOrganization);
        setWorkspaceReady(true);
      } catch (error) {
        if (run !== bootstrapRun.current) return;
        setOrganization(null);
        setWorkspaceReady(false);
        setBootstrapError(error instanceof Error ? error.message : "Initialisation sécurisée impossible.");
      }
    })();

    return () => {
      if (bootstrapRun.current === run) bootstrapRun.current += 1;
    };
  }, [authReady, session?.user.id, bootstrapNonce]);

  useEffect(() => {
    if (!workspaceReady || !session?.user || !organization) return;
    let saving = false;
    let queued = false;
    let disposed = false;

    const synchronize = async () => {
      if (disposed) return;
      const signature = pilotStorageSignature(window.localStorage);
      if (signature === lastSyncedSignature.current) return;

      markPilotSnapshotDirty(window.localStorage, organization.id, signature);
      if (saving) {
        queued = true;
        return;
      }

      saving = true;
      setSyncStatus("saving");
      try {
        const snapshot = readPilotLocalSnapshot(window.localStorage);
        await savePilotCloudSnapshot(organization.id, session.user.id, snapshot);
        if (disposed) return;
        lastSyncedSignature.current = signature;
        markPilotSnapshotSynced(window.localStorage, organization.id, signature);
        setSyncStatus("saved");
      } catch (error) {
        if (!disposed) {
          console.error("[FORGEO] Synchronisation pilote impossible", error);
          setSyncStatus("error");
        }
      } finally {
        saving = false;
        if (queued && !disposed) {
          queued = false;
          void synchronize();
        }
      }
    };

    const markDirtyBeforeLeaving = () => {
      const signature = pilotStorageSignature(window.localStorage);
      if (signature !== lastSyncedSignature.current) {
        markPilotSnapshotDirty(window.localStorage, organization.id, signature);
        void synchronize();
      }
    };

    const interval = window.setInterval(() => void synchronize(), 900);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") markDirtyBeforeLeaving();
    };
    window.addEventListener("pagehide", markDirtyBeforeLeaving);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", markDirtyBeforeLeaving);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspaceReady, organization?.id, session?.user.id]);

  useEffect(() => {
    if (!workspaceReady || !organization) return;
    let accountButton: HTMLButtonElement | null = null;

    const attach = () => {
      const host = document.querySelector<HTMLElement>(".rm-header-actions");
      if (!host) return;
      const existing = host.querySelector<HTMLButtonElement>("[data-forgeo-account-button]");
      if (existing) {
        accountButton = existing;
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.forgeoAccountButton = "true";
      button.setAttribute("aria-label", "Compte FORGEO");
      button.title = `Compte · ${organization.name}`;
      button.textContent = organization.name.trim().slice(0, 1).toUpperCase() || "F";
      button.addEventListener("click", () => setAccountOpen(true));
      host.prepend(button);
      accountButton = button;
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      observer.disconnect();
      accountButton?.remove();
    };
  }, [workspaceReady, organization?.id, organization?.name]);

  function openAuth(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthMessage("");
    setPassword("");
    setPublicView("auth");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCompany = companyName.trim();
    const invalidPassword = mode === "signup" ? password.length < 8 : password.length === 0;
    if (!cleanEmail || invalidPassword || (mode === "signup" && cleanCompany.length < 2)) {
      setAuthMessage(mode === "signup"
        ? "Renseigne l’entreprise, un e-mail valide et un mot de passe d’au moins 8 caractères."
        : "Renseigne ton e-mail et ton mot de passe.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { company_name: cleanCompany } },
        });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          setAuthMessage("Compte créé. Préparation de l’espace entreprise…");
        } else {
          setAuthMessage("Compte créé. Confirme l’adresse e-mail reçue, puis connecte-toi.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : ""));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!session?.user || !organization) return;
    setSignOutBusy(true);
    setSyncStatus("saving");
    try {
      const snapshot = readPilotLocalSnapshot(window.localStorage);
      const signature = pilotStorageSignature(window.localStorage);
      markPilotSnapshotDirty(window.localStorage, organization.id, signature);
      await savePilotCloudSnapshot(organization.id, session.user.id, snapshot);
      markPilotSnapshotSynced(window.localStorage, organization.id, signature);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      clearPilotLocalSnapshot(window.localStorage);
      lastSyncedSignature.current = "";
      setAccountOpen(false);
      setOrganization(null);
      setWorkspaceReady(false);
      setSyncStatus("saved");
      setPublicView("landing");
    } catch (error) {
      console.error("[FORGEO] Déconnexion sécurisée impossible", error);
      setSyncStatus("error");
    } finally {
      setSignOutBusy(false);
    }
  }

  if (!authReady) return <LoadingScreen />;

  if (!session?.user) {
    if (publicView === "landing") {
      return <ForgeoPublicEntry onLogin={() => openAuth("login")} onSignup={() => openAuth("signup")} />;
    }

    return (
      <main className="forgeo-auth-screen">
        <section className="forgeo-auth-layout" role="dialog" aria-label={mode === "signup" ? "Création de compte FORGEO" : "Connexion FORGEO"}>
          <aside className="forgeo-auth-aside">
            <div className="forgeo-auth-aside-top">
              <div className="forgeo-auth-logo"><span className="forgeo-auth-logo-mark">F</span><span>FORGEO</span></div>
              <h1>{mode === "signup" ? "Votre entreprise, votre espace, vos données." : "Retrouvez le chantier là où vous l'avez laissé."}</h1>
              <p>{mode === "signup" ? "Créez l’espace de votre entreprise. Vos clients, devis et factures seront rattachés à cet espace sécurisé." : "Connectez-vous pour retrouver vos clients, devis, factures et données de chantier synchronisés."}</p>
            </div>
            <div className="forgeo-auth-aside-points">
              <span><b>✓</b> Données séparées par entreprise</span>
              <span><b>✓</b> Vos prix ne sont jamais remplacés silencieusement</span>
              <span><b>✓</b> Pensé pour mobile et ordinateur</span>
            </div>
          </aside>
          <div className="forgeo-auth-panel">
            <button type="button" className="forgeo-auth-back" onClick={() => { setPublicView("landing"); setAuthMessage(""); }}>← Retour à l’accueil</button>
            <div className="forgeo-auth-brand">
              <span>ESPACE ARTISAN SÉCURISÉ</span>
              <h2>{mode === "signup" ? "Créer mon espace FORGEO" : "Bon retour sur FORGEO"}</h2>
              <p>{mode === "signup" ? "Quelques informations suffisent pour démarrer." : "Connectez-vous avec l’adresse de votre entreprise."}</p>
            </div>
            <div className="forgeo-auth-tabs">
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setAuthMessage(""); setPassword(""); }}>Connexion</button>
              <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setAuthMessage(""); setPassword(""); }}>Créer un compte</button>
            </div>
            <form className="forgeo-auth-form" onSubmit={(event) => void submitAuth(event)}>
              {mode === "signup" && <label>Nom de l’entreprise<input autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Ex. Martin Peinture" /></label>}
              <label>Adresse e-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@entreprise.fr" /></label>
              <label>Mot de passe<input type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "8 caractères minimum" : "Votre mot de passe"} /></label>
              <button className="forgeo-auth-primary" type="submit" disabled={authBusy}>{authBusy ? "Chargement…" : mode === "signup" ? "Créer mon espace entreprise" : "Se connecter"}</button>
            </form>
            {authMessage && <p className="forgeo-auth-message">{authMessage}</p>}
            <div className="forgeo-auth-trust"><span>Connexion sécurisée</span><span>•</span><span>Espace séparé par entreprise</span></div>
          </div>
        </section>
        <AuthStyles />
      </main>
    );
  }

  if (bootstrapError) {
    return (
      <main className="forgeo-auth-screen">
        <section className="forgeo-auth-error" role="alert"><h2>Espace sécurisé indisponible</h2><p>{bootstrapError}</p><button className="forgeo-auth-primary" type="button" onClick={() => setBootstrapNonce((value) => value + 1)}>Réessayer</button></section>
        <AuthStyles />
      </main>
    );
  }

  if (!workspaceReady || !organization) return <LoadingScreen label="Chargement des données de l’entreprise…" />;

  return (
    <>
      {children}
      <button type="button" className="forgeo-account-fallback" onClick={() => setAccountOpen(true)}>Compte FORGEO</button>
      {accountOpen && (
        <div className="forgeo-account-backdrop" role="dialog" aria-modal="true" aria-label="Compte FORGEO" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}>
          <section className="forgeo-account-panel">
            <header><div><small>ESPACE SÉCURISÉ</small><strong>{organization.name}</strong></div><button type="button" aria-label="Fermer" onClick={() => setAccountOpen(false)}>×</button></header>
            <div className="forgeo-account-meta"><span>Compte</span><strong>{session.user.email || "Compte FORGEO"}</strong><span>Rôle : {organization.role}</span><div className={`forgeo-account-sync ${syncStatus}`}>{syncStatus === "saved" ? "Données synchronisées" : syncStatus === "saving" ? "Synchronisation en cours…" : "Synchronisation à vérifier"}</div></div>
            <button type="button" className="forgeo-account-signout" disabled={signOutBusy} onClick={() => void signOut()}>{signOutBusy ? "Synchronisation…" : "Se déconnecter"}</button>
          </section>
        </div>
      )}
      <AuthStyles />
    </>
  );
}

export default function PilotAuthGate({ children }: { children: ReactNode }) {
  if (AUTH_BYPASS) return <>{children}</>;
  return <RequiredPilotAuth>{children}</RequiredPilotAuth>;
}
