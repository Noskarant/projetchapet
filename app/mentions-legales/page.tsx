import type { Metadata } from "next";
import LegalPublicPage from "../legal-public-page";

export const metadata: Metadata = {
  title: "Mentions légales — MANUFEO",
  description: "Mentions légales du site et du service MANUFEO.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPublicPage
      eyebrow="Informations légales"
      title="Mentions légales"
      intro="Informations relatives à l’édition, à l’hébergement et à l’utilisation du site manufeo.fr et du service MANUFEO."
    >
      <p className="mlp-note mlp-warning">
        MANUFEO est actuellement en phase pilote. Avant toute ouverture commerciale payante,
        les informations relatives à l’entité contractante définitive (dénomination ou nom,
        forme juridique le cas échéant, adresse, SIREN/RNE et numéro de TVA le cas échéant)
        devront être complétées sur cette page et dans les CGV.
      </p>

      <section className="mlp-section">
        <h2>1. Édition du site</h2>
        <p>
          Le site <strong>manufeo.fr</strong> présente MANUFEO, un logiciel de gestion destiné
          aux artisans et professionnels du bâtiment.
        </p>
        <table className="mlp-table">
          <tbody>
            <tr>
              <th>Nom du service</th>
              <td>MANUFEO</td>
            </tr>
            <tr>
              <th>Site principal</th>
              <td>https://manufeo.fr</td>
            </tr>
            <tr>
              <th>Responsable de publication</th>
              <td>Noé Anterieux</td>
            </tr>
            <tr>
              <th>Contact</th>
              <td><a href="mailto:noe.anterieux@importmarginguard.fr">noe.anterieux@importmarginguard.fr</a></td>
            </tr>
            <tr>
              <th>Entité contractante</th>
              <td>À compléter avant l’ouverture commerciale payante de MANUFEO.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mlp-section">
        <h2>2. Hébergement</h2>
        <p>
          Le site et l’application sont hébergés par <strong>Vercel Inc.</strong>,
          440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.
        </p>
        <p>
          Certaines données applicatives sont également traitées par des prestataires
          techniques décrits dans la <a href="/politique-confidentialite">Politique de confidentialité</a>.
        </p>
      </section>

      <section className="mlp-section">
        <h2>3. Propriété intellectuelle</h2>
        <p>
          La marque, le nom, l’identité visuelle, les interfaces, textes, éléments graphiques,
          logiciels et contenus propres à MANUFEO sont protégés par les règles applicables à la
          propriété intellectuelle. Toute reproduction, représentation, extraction ou adaptation
          non autorisée, en dehors des exceptions prévues par la loi, est interdite.
        </p>
        <p>
          Les marques, bibliothèques et services tiers restent la propriété de leurs titulaires respectifs.
        </p>
      </section>

      <section className="mlp-section">
        <h2>4. Informations et outils d’assistance</h2>
        <p>
          MANUFEO peut proposer des fonctions d’assistance, notamment de dictée, de structuration
          de données ou de préparation de contenus à l’aide de systèmes automatisés. Ces fonctions
          constituent une aide au travail : l’utilisateur reste responsable de la vérification des
          informations, prix, quantités, taux, coordonnées et documents avant validation ou envoi.
        </p>
      </section>

      <section className="mlp-section">
        <h2>5. Signalement et contact</h2>
        <p>
          Pour signaler un contenu, une erreur, une difficulté technique ou pour toute question
          concernant le site, vous pouvez écrire à
          {" "}<a href="mailto:noe.anterieux@importmarginguard.fr">noe.anterieux@importmarginguard.fr</a>.
        </p>
      </section>
    </LegalPublicPage>
  );
}
