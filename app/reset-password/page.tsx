"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Step = "request" | "update" | "done";

function friendlyResetError(message: string) {
  if (/password/i.test(message) && /least|short|characters/i.test(message)) {
    return "Utilisez un mot de passe d’au moins 8 caractères.";
  }
  if (/expired|invalid/i.test(message)) {
    return "Le lien n’est plus valide. Demandez un nouveau lien de récupération.";
  }
  return "L’opération n’a pas pu aboutir. Réessayez.";
}

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setStep("update");
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setStep("update");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Renseignez l’adresse e-mail de votre compte FORGEO.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage("Si un compte FORGEO existe avec cette adresse, un lien de récupération vient d’être envoyé.");
    } catch (error) {
      setMessage(friendlyResetError(error instanceof Error ? error.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Utilisez un mot de passe d’au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmation("");
      setStep("done");
    } catch (error) {
      setMessage(friendlyResetError(error instanceof Error ? error.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="frp-shell">
      <section className="frp-card" aria-label="Récupération du compte FORGEO">
        <a className="frp-brand" href="/" aria-label="Retour à FORGEO"><span>F</span><b>FORGEO</b></a>

        {step === "request" && (
          <>
            <div className="frp-heading"><small>ACCÈS À VOTRE ESPACE</small><h1>Mot de passe oublié ?</h1><p>Indiquez l’adresse e-mail utilisée pour FORGEO. Le message affiché reste volontairement identique, qu’un compte existe ou non.</p></div>
            <form onSubmit={(event) => void requestReset(event)}>
              <label>Adresse e-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@entreprise.fr" /></label>
              <button type="submit" disabled={busy}>{busy ? "Envoi…" : "Recevoir le lien de récupération"}</button>
            </form>
          </>
        )}

        {step === "update" && (
          <>
            <div className="frp-heading"><small>COMPTE SÉCURISÉ</small><h1>Choisir un nouveau mot de passe</h1><p>Le lien de récupération a ouvert une session temporaire sécurisée. Choisissez maintenant votre nouveau mot de passe.</p></div>
            <form onSubmit={(event) => void updatePassword(event)}>
              <label>Nouveau mot de passe<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" /></label>
              <label>Confirmer le mot de passe<input type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
              <button type="submit" disabled={busy}>{busy ? "Mise à jour…" : "Enregistrer le nouveau mot de passe"}</button>
            </form>
          </>
        )}

        {step === "done" && (
          <div className="frp-heading frp-done"><small>TERMINÉ</small><h1>Mot de passe mis à jour.</h1><p>Votre session est toujours sécurisée. Vous pouvez retourner dans FORGEO.</p><a className="frp-primary-link" href="/">Ouvrir mon espace FORGEO →</a></div>
        )}

        {message && <p className="frp-message" role="status">{message}</p>}
        {step !== "done" && <div className="frp-footer"><a href="/">← Retour à FORGEO</a><span>Espace séparé par entreprise</span></div>}
      </section>
      <style>{`
        .frp-shell{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f7f3e9;color:#142721;font-family:Arial,Helvetica,sans-serif}.frp-card{box-sizing:border-box;width:min(480px,100%);padding:30px;border:1px solid #d9d2c3;border-radius:21px;background:#fff;box-shadow:0 28px 75px rgba(32,45,39,.12)}.frp-brand{display:inline-flex;align-items:center;gap:9px;color:#102922;text-decoration:none;font-size:17px;letter-spacing:.08em}.frp-brand span{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#102922;color:#f5efe1;font-size:18px;font-weight:950}.frp-heading{display:grid;gap:8px;margin-top:28px}.frp-heading small{color:#e66b37;font-size:9px;font-weight:950;letter-spacing:.15em}.frp-heading h1{margin:0;color:#102922;font-size:29px;line-height:1.08;letter-spacing:-.035em}.frp-heading p{margin:0;color:#68756f;font-size:11px;line-height:1.55}.frp-card form{display:grid;gap:13px;margin-top:23px}.frp-card label{display:grid;gap:6px;color:#40514a;font-size:10px;font-weight:850}.frp-card input{box-sizing:border-box;width:100%;height:47px;padding:0 13px;border:1px solid #d8d2c6;border-radius:10px;background:#fff;color:#142721;font:650 14px Arial,sans-serif;outline:none}.frp-card input:focus{border-color:#527267;box-shadow:0 0 0 3px rgba(52,96,81,.1)}.frp-card form button,.frp-primary-link{min-height:49px;display:grid;place-items:center;border:0;border-radius:10px;background:#102922;color:#fff;text-decoration:none;font:900 13px Arial,sans-serif;cursor:pointer}.frp-card form button:disabled{opacity:.55;cursor:default}.frp-message{margin:14px 0 0;padding:11px 12px;border-radius:9px;background:#f1f5f1;color:#40564e;font-size:10.5px;line-height:1.45}.frp-footer{margin-top:17px;padding-top:14px;border-top:1px solid #ece7dc;display:flex;justify-content:space-between;gap:12px;align-items:center;color:#7b8580;font-size:9px;font-weight:750}.frp-footer a{color:#355c4f;text-decoration:none}.frp-done .frp-primary-link{margin-top:13px}.frp-primary-link{padding:0 16px}@media(max-width:560px){.frp-shell{padding:16px}.frp-card{padding:23px;border-radius:18px}.frp-footer{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
