"use client";

import type { Session } from "@supabase/supabase-js";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ForgeoPublicEntry, { type ForgeoPublicView } from "./forgeo-public-entry";

const AUTH_BYPASS = process.env.NEXT_PUBLIC_FORGEO_AUTH_BYPASS === "1";

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirmez d’abord votre adresse e-mail.";
  if (/user already registered/i.test(message)) return "Un compte existe déjà avec cette adresse e-mail.";
  if (/password/i.test(message) && /least|short|characters/i.test(message)) return "Utilisez un mot de passe d’au moins 8 caractères.";
  return "Connexion impossible pour le moment. Réessayez.";
}

function Loading() {
  return <main aria-label="Chargement de FORGEO" style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#f3efe6",color:"#102a3d",fontFamily:"Inter,system-ui,sans-serif"}}><strong style={{fontSize:23,letterSpacing:".09em"}}>FORGEO</strong></main>;
}

function RequiredGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<ForgeoPublicView>("landing");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(friendlyAuthError(error.message));
      setSession(data.session);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setReady(true);
      if (event === "SIGNED_OUT") {
        setView("landing");
        setPassword("");
        setMessage("");
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  function navigate(next: ForgeoPublicView) {
    setView(next);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signup = view === "signup";
    const cleanEmail = email.trim().toLowerCase();
    const cleanCompany = companyName.trim();
    if (!cleanEmail || password.length < 8 || (signup && cleanCompany.length < 2)) {
      setMessage(signup ? "Renseignez votre entreprise, votre e-mail et un mot de passe d’au moins 8 caractères." : "Renseignez votre e-mail et un mot de passe d’au moins 8 caractères.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { company_name: cleanCompany } } });
        if (error) throw error;
        if (data.session) setSession(data.session);
        else setMessage("Compte créé. Confirmez l’adresse e-mail reçue, puis connectez-vous.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      setMessage(friendlyAuthError(error instanceof Error ? error.message : ""));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  if (session?.user) return <>{children}</>;

  return <ForgeoPublicEntry view={view} companyName={companyName} email={email} password={password} authBusy={busy} authMessage={message} onNavigate={navigate} onCompanyNameChange={setCompanyName} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={(event) => void submit(event)} />;
}

export default function ForgeoPublicGate({ children }: { children: ReactNode }) {
  if (AUTH_BYPASS) return <>{children}</>;
  return <RequiredGate>{children}</RequiredGate>;
}
