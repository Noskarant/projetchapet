"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AuthFrame, PasswordField } from "../forgeo-public-ui";

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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
      setMessage("Renseignez l’adresse e-mail de votre compte MANUFEO.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage(
        "Si un compte MANUFEO existe avec cette adresse, un lien de récupération vient d’être envoyé.",
      );
    } catch (error) {
      setMessage(
        friendlyResetError(error instanceof Error ? error.message : ""),
      );
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
      setMessage(
        friendlyResetError(error instanceof Error ? error.message : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame label="Récupération du compte MANUFEO">
      {step === "request" && (
        <>
          <div className="forgeo-auth-brand">
            <span>RETROUVER VOTRE ESPACE</span>
            <h1>Mot de passe oublié ?</h1>
            <p>
              Indiquez votre adresse e-mail. Nous vous enverrons un lien pour
              choisir un nouveau mot de passe.
            </p>
          </div>
          <form
            className="forgeo-auth-form"
            onSubmit={(event) => void requestReset(event)}
            aria-busy={busy}
          >
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
            <button
              className="forgeo-auth-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Envoi…" : "Recevoir le lien de récupération"}
            </button>
          </form>
        </>
      )}
      {step === "update" && (
        <>
          <div className="forgeo-auth-brand">
            <span>VOTRE COMPTE MANUFEO</span>
            <h1>Choisir un nouveau mot de passe</h1>
            <p>
              Choisissez un mot de passe que vous n’utilisez pas sur un autre
              site.
            </p>
          </div>
          <form
            className="forgeo-auth-form"
            onSubmit={(event) => void updatePassword(event)}
            aria-busy={busy}
          >
            <PasswordField
              label="Nouveau mot de passe"
              value={password}
              onChange={setPassword}
              newPassword
              hint
            />
            <PasswordField
              label="Confirmer le mot de passe"
              value={confirmation}
              onChange={setConfirmation}
              newPassword
            />
            <button
              className="forgeo-auth-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Mise à jour…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        </>
      )}
      {step === "done" && (
        <div className="forgeo-auth-brand">
          <span>C’EST ENREGISTRÉ</span>
          <h1>Mot de passe mis à jour.</h1>
          <p>
            Votre nouveau mot de passe est prêt. Vous pouvez retrouver votre
            espace.
          </p>
          <a className="forgeo-auth-primary" href="/">
            Ouvrir mon espace MANUFEO →
          </a>
        </div>
      )}
      {message && (
        <p className="forgeo-auth-message" role="status">
          {message}
        </p>
      )}
    </AuthFrame>
  );
}
