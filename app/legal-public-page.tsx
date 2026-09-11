import Image from "next/image";
import type { ReactNode } from "react";

const CONTACT_EMAIL = "noe.anterieux@importmarginguard.fr";

export default function LegalPublicPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mlp-page">
      <header className="mlp-header">
        <a className="mlp-brand" href="/" aria-label="MANUFEO, retour à l’accueil">
          <Image src="/manufeo-mark.webp" width={48} height={38} alt="" priority />
          <span>MANUFEO</span>
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`}>Nous contacter</a>
      </header>

      <div className="mlp-shell">
        <section className="mlp-hero">
          <p className="mlp-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="mlp-lead">{intro}</p>
        </section>

        <article className="mlp-card">{children}</article>
        <p className="mlp-update">Dernière mise à jour : 11 septembre 2026.</p>
      </div>

      <footer className="mlp-footer">
        <p>© 2026 MANUFEO. Tous droits réservés.</p>
        <nav aria-label="Informations légales">
          <a href="/mentions-legales">Mentions légales</a>
          <a href="/politique-confidentialite">Politique de confidentialité</a>
          <a href="/cgv">CGV</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
      </footer>
    </main>
  );
}
