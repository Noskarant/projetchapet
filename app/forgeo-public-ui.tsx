"use client";

import Image from "next/image";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function ForgeoBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`fp-brand${compact ? " fp-brand-compact" : ""}`}>
      <Image
        src="/manufeo-mark.webp"
        width={48}
        height={38}
        alt=""
        className="manufeo-brand-mark"
      />
      <span>
        <b>MANUFEO</b>
        {!compact && <small>SIMPLIFIE LE QUOTIDIEN DES PROS</small>}
      </span>
    </span>
  );
}

export function ManufeoLockup({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/manufeo-logo.webp"
      width={360}
      height={360}
      alt="MANUFEO — Simplifie le quotidien des pros"
      className={`manufeo-lockup ${className}`.trim()}
    />
  );
}

export function ArtisanPhoto({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      src="/forgeo-artisan.webp"
      alt="Illustration d’un artisan consultant son téléphone sur un chantier de rénovation"
      fill
      sizes="(max-width: 760px) 100vw, 50vw"
      priority={priority}
      className="fp-artisan-photo"
    />
  );
}

export function AuthFrame({
  children,
  back,
  signup = false,
  label,
}: {
  children: ReactNode;
  back?: () => void;
  signup?: boolean;
  label: string;
}) {
  return (
    <main className="forgeo-auth-screen">
      <div className="forgeo-auth-header">
        <a href="/" aria-label="MANUFEO, accueil">
          <ForgeoBrand />
        </a>
      </div>
      <section className="forgeo-auth-layout" role="dialog" aria-label={label}>
        <aside className="forgeo-auth-aside">
          <ArtisanPhoto priority />
          <div className="forgeo-auth-aside-copy">
            <span className="fp-eyebrow">AU PLUS PRÈS DU TERRAIN</span>
            <h2>
              {signup
                ? "Votre métier mérite les bons outils."
                : "Votre activité, toujours à portée de main."}
            </h2>
            <p>
              Clients, devis et chantiers.
              <br />
              Gardez le fil, où que vous soyez.
            </p>
          </div>
        </aside>
        <div className="forgeo-auth-panel">
          {back ? (
            <button type="button" className="forgeo-auth-back" onClick={back}>
              ← Retour à l’accueil
            </button>
          ) : (
            <a className="forgeo-auth-back" href="/">
              ← Retour à l’accueil
            </a>
          )}
          {children}
          <div className="forgeo-auth-trust">
            <LockKeyhole size={15} aria-hidden="true" /> Un espace dédié à votre
            entreprise
          </div>
        </div>
      </section>
      <p className="forgeo-auth-footnote">MANUFEO · Simplifie le quotidien des pros</p>
    </main>
  );
}

export function PasswordField({
  label = "Mot de passe",
  value,
  onChange,
  newPassword = false,
  hint = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  newPassword?: boolean;
  hint?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="fp-field">
      <label htmlFor={id}>{label}</label>
      <div className="fp-password-wrap">
        <input
          id={id}
          name={label}
          required
          type={visible ? "text" : "password"}
          minLength={newPassword ? 8 : undefined}
          autoComplete={newPassword ? "new-password" : "current-password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          aria-label={`${visible ? "Masquer" : "Afficher"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {hint && <small id={`${id}-hint`}>8 caractères minimum.</small>}
    </div>
  );
}
