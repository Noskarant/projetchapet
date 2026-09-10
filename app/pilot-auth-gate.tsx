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
import { AuthFrame, PasswordField } from "./forgeo-public-ui";

const AUTH_BYPASS = process.env.NEXT_PUBLIC_FORGEO_AUTH_BYPASS === "1";

type SyncStatus = "saved" | "saving" | "error";
type AuthMode = "login" | "signup";
type PublicView = "landing" | "auth";

function LoadingScreen({
  label = "Sécurisation de votre espace…",
}: {
  label?: string;
}) {
  return (
    <main
      className="forgeo-auth-screen"
      aria-label="Chargement sécurisé FORGEO"
    >
      <div className="forgeo-auth-loading">
        <span className="forgeo-auth-loading-mark">F</span>
        <strong>{label}</strong>
      </div>
      <AuthStyles />
    </main>
  );
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message))
    return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message))
    return "Confirmez d’abord votre adresse e-mail.";
  if (/user already registered/i.test(message))
    return "Un compte existe déjà avec cette adresse e-mail.";
  if (/password/i.test(message) && /least|short|characters/i.test(message))
    return "Utilisez un mot de passe d’au moins 8 caractères.";
  return "Connexion impossible pour le moment. Réessayez.";
}

function AuthStyles() {
  return (
    <style>{`
    .forgeo-account-fallback{position:fixed;z-index:11900;right:16px;top:16px;height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(6,10,20,.9);color:#fff;font-weight:850;box-shadow:0 8px 22px rgba(0,0,0,.24)}.forgeo-account-backdrop{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;padding:18px;background:rgba(0,3,10,.68);backdrop-filter:blur(8px)}.forgeo-account-panel{width:min(410px,100%);display:grid;gap:14px;padding:20px;border:1px solid rgba(255,255,255,.11);border-radius:21px;background:#090f1d;color:#f8fafc;box-shadow:0 28px 80px rgba(0,0,0,.45)}.forgeo-account-panel header{display:flex;justify-content:space-between;gap:12px;align-items:start}.forgeo-account-panel header div{display:grid;gap:3px}.forgeo-account-panel header small{color:#8f9db2;font-size:10px;font-weight:900;letter-spacing:.12em}.forgeo-account-panel header strong{font-size:19px}.forgeo-account-panel header button{width:36px;height:36px;border:0;border-radius:11px;background:rgba(255,255,255,.08);color:#fff;font-size:20px}.forgeo-account-meta{display:grid;gap:7px;padding:12px;border-radius:13px;background:rgba(255,255,255,.055)}.forgeo-account-meta span{font-size:11px;color:#9cabbf}.forgeo-account-meta strong{font-size:13px;overflow-wrap:anywhere}.forgeo-account-sync{font-size:11px;font-weight:850}.forgeo-account-sync.saved{color:#75d6a3}.forgeo-account-sync.saving{color:#f4c76c}.forgeo-account-sync.error{color:#ff9b9b}.forgeo-account-signout{min-height:44px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(255,255,255,.065);color:#fff;font-weight:900}.forgeo-account-signout:disabled{opacity:.55}@media(max-width:820px){.forgeo-account-fallback{display:none}.forgeo-account-backdrop{place-items:end center;padding:0}.forgeo-account-panel{width:100%;box-sizing:border-box;border-radius:22px 22px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom))}}
  `}</style>
  );
}

function RequiredPilotAuth({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<PilotOrganization | null>(
    null,
  );
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
  const [confirmationSent, setConfirmationSent] = useState(false);
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
            await savePilotCloudSnapshot(
              nextOrganization.id,
              session.user.id,
              localSnapshot,
            );
          } else {
            writePilotLocalSnapshot(window.localStorage, cloudSnapshot);
          }
        } else {
          await savePilotCloudSnapshot(
            nextOrganization.id,
            session.user.id,
            localSnapshot,
          );
        }
        if (run !== bootstrapRun.current) return;

        const synchronizedSignature = pilotStorageSignature(
          window.localStorage,
        );
        lastSyncedSignature.current = synchronizedSignature;
        markPilotSnapshotSynced(
          window.localStorage,
          nextOrganization.id,
          synchronizedSignature,
        );
        setOrganization(nextOrganization);
        setWorkspaceReady(true);
      } catch (error) {
        if (run !== bootstrapRun.current) return;
        setOrganization(null);
        setWorkspaceReady(false);
        setBootstrapError(
          error instanceof Error
            ? error.message
            : "Initialisation sécurisée impossible.",
        );
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
        await savePilotCloudSnapshot(
          organization.id,
          session.user.id,
          snapshot,
        );
        if (disposed) return;
        lastSyncedSignature.current = signature;
        markPilotSnapshotSynced(
          window.localStorage,
          organization.id,
          signature,
        );
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
      const existing = host.querySelector<HTMLButtonElement>(
        "[data-forgeo-account-button]",
      );
      if (existing) {
        accountButton = existing;
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.forgeoAccountButton = "true";
      button.setAttribute("aria-label", "Compte FORGEO");
      button.title = `Compte · ${organization.name}`;
      button.textContent =
        organization.name.trim().slice(0, 1).toUpperCase() || "F";
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
    setConfirmationSent(false);
    setAuthMessage("");
    setPassword("");
    setPublicView("auth");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCompany = companyName.trim();
    const invalidPassword =
      mode === "signup" ? password.length < 8 : password.length === 0;
    if (
      !cleanEmail ||
      invalidPassword ||
      (mode === "signup" && cleanCompany.length < 2)
    ) {
      setAuthMessage(
        mode === "signup"
          ? "Renseignez l’entreprise, un e-mail valide et un mot de passe d’au moins 8 caractères."
          : "Renseignez votre e-mail et votre mot de passe.",
      );
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
          setPassword("");
          setConfirmationSent(true);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      setAuthMessage(
        friendlyAuthError(error instanceof Error ? error.message : ""),
      );
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
      return (
        <ForgeoPublicEntry
          onLogin={() => openAuth("login")}
          onSignup={() => openAuth("signup")}
        />
      );
    }

    return (
      <AuthFrame
        label={
          mode === "signup" ? "Création de compte FORGEO" : "Connexion FORGEO"
        }
        signup={mode === "signup"}
        back={() => {
          setPublicView("landing");
          setAuthMessage("");
          setPassword("");
          setConfirmationSent(false);
        }}
      >
        {confirmationSent ? (
          <div className="forgeo-auth-brand">
            <span>ENCORE UNE ÉTAPE</span>
            <h1>Vérifiez votre messagerie.</h1>
            <p>
              Si votre inscription nécessite une confirmation, vous recevrez un
              lien à l’adresse <strong>{email}</strong>. Ouvrez-le pour activer
              votre compte.
            </p>
            <p>Pensez à vérifier les courriers indésirables.</p>
            <button
              className="forgeo-auth-primary"
              onClick={() => openAuth("login")}
            >
              Revenir à la connexion
            </button>
          </div>
        ) : (
          <>
            <div className="forgeo-auth-brand">
              <span>VOTRE ESPACE FORGEO</span>
              <h1>
                {mode === "signup"
                  ? "Créer mon compte"
                  : "Se connecter à FORGEO"}
              </h1>
              <p>
                {mode === "signup"
                  ? "Les bons outils pour votre prochain chantier."
                  : "Heureux de vous retrouver. Reprenons le fil."}
              </p>
            </div>
            <form
              className="forgeo-auth-form"
              onSubmit={(event) => void submitAuth(event)}
              aria-busy={authBusy}
            >
              {mode === "signup" && (
                <label>
                  Nom de l’entreprise
                  <input
                    required
                    minLength={2}
                    autoComplete="organization"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Ex. Martin Peinture"
                  />
                </label>
              )}
              <label>
                Adresse e-mail
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="contact@entreprise.fr"
                />
              </label>
              <PasswordField
                key={mode}
                value={password}
                onChange={setPassword}
                newPassword={mode === "signup"}
                hint={mode === "signup"}
              />
              {mode === "login" && (
                <a className="forgeo-auth-reset-link" href="/reset-password">
                  Mot de passe oublié ?
                </a>
              )}
              <button
                className="forgeo-auth-primary"
                type="submit"
                disabled={authBusy}
              >
                {authBusy
                  ? "Chargement…"
                  : mode === "signup"
                    ? "Créer mon compte"
                    : "Se connecter"}
              </button>
            </form>
            {authMessage && (
              <p className="forgeo-auth-message" role="status">
                {authMessage}
              </p>
            )}
            <p className="forgeo-auth-switch">
              {mode === "signup"
                ? "Déjà un compte ?"
                : "Vous découvrez FORGEO ?"}{" "}
              <button
                type="button"
                disabled={authBusy}
                onClick={() => openAuth(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup" ? "Se connecter" : "Créer un compte"}
              </button>
            </p>
          </>
        )}
      </AuthFrame>
    );
  }

  if (bootstrapError) {
    return (
      <main className="forgeo-auth-screen">
        <section className="forgeo-auth-error" role="alert">
          <h2>Espace sécurisé indisponible</h2>
          <p>{bootstrapError}</p>
          <button
            className="forgeo-auth-primary"
            type="button"
            onClick={() => setBootstrapNonce((value) => value + 1)}
          >
            Réessayer
          </button>
        </section>
        <AuthStyles />
      </main>
    );
  }

  if (!workspaceReady || !organization)
    return <LoadingScreen label="Chargement des données de l’entreprise…" />;

  return (
    <>
      {children}
      <button
        type="button"
        className="forgeo-account-fallback"
        onClick={() => setAccountOpen(true)}
      >
        Compte FORGEO
      </button>
      {accountOpen && (
        <div
          className="forgeo-account-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Compte FORGEO"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAccountOpen(false);
          }}
        >
          <section className="forgeo-account-panel">
            <header>
              <div>
                <small>ESPACE SÉCURISÉ</small>
                <strong>{organization.name}</strong>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setAccountOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="forgeo-account-meta">
              <span>Compte</span>
              <strong>{session.user.email || "Compte FORGEO"}</strong>
              <span>Rôle : {organization.role}</span>
              <div className={`forgeo-account-sync ${syncStatus}`}>
                {syncStatus === "saved"
                  ? "Données synchronisées"
                  : syncStatus === "saving"
                    ? "Synchronisation en cours…"
                    : "Synchronisation à vérifier"}
              </div>
            </div>
            <button
              type="button"
              className="forgeo-account-signout"
              disabled={signOutBusy}
              onClick={() => void signOut()}
            >
              {signOutBusy ? "Synchronisation…" : "Se déconnecter"}
            </button>
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
