import type { Metadata } from "next";
import LegalPublicPage from "../legal-public-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité — MANUFEO",
  description: "Politique de confidentialité et de protection des données du service MANUFEO.",
};

export default function PolitiqueConfidentialitePage() {
  return (
    <LegalPublicPage
      eyebrow="Protection des données"
      title="Politique de confidentialité"
      intro="Cette politique explique quelles données MANUFEO traite, pourquoi elles sont utilisées et quels sont vos droits."
    >
      <section className="mlp-section">
        <h2>1. Qui traite vos données ?</h2>
        <p>
          MANUFEO traite les données nécessaires à la création et à l’administration des comptes,
          à la fourniture du logiciel, à la sécurité du service et à la relation avec ses utilisateurs.
          Pour toute demande relative à vos données, vous pouvez écrire à
          {" "}<a href="mailto:noe.anterieux@importmarginguard.fr">noe.anterieux@importmarginguard.fr</a>.
        </p>
        <p className="mlp-note mlp-warning">
          MANUFEO étant actuellement en phase pilote, l’identité complète de l’entité responsable
          du traitement sera mise à jour avant l’ouverture commerciale payante du service.
        </p>
      </section>

      <section className="mlp-section">
        <h2>2. Données susceptibles d’être traitées</h2>
        <ul>
          <li><strong>Compte :</strong> adresse e-mail, données d’authentification et informations techniques de session.</li>
          <li><strong>Entreprise :</strong> raison sociale, nom commercial, SIRET, TVA, coordonnées, adresse, métier, exercice comptable, logo et adresse comptable.</li>
          <li><strong>Activité :</strong> clients, contacts, devis, factures, statuts, encaissements, agenda et informations utiles au suivi commercial.</li>
          <li><strong>Chantiers :</strong> projets, membres affectés, étapes, incidents, commentaires, photos et journal d’activité.</li>
          <li><strong>Fonctions vocales et IA :</strong> enregistrements audio transmis pour transcription, textes dictés, descriptions de chantier et données nécessaires à la génération d’une proposition.</li>
          <li><strong>Support et e-mails :</strong> adresses de destinataires, contenu utile à l’envoi de documents, journaux techniques d’envoi et échanges de support.</li>
          <li><strong>Données techniques :</strong> journaux d’erreur, informations de sécurité et données strictement nécessaires au fonctionnement de l’application.</li>
        </ul>
      </section>

      <section className="mlp-section">
        <h2>3. Pourquoi ces données sont-elles utilisées ?</h2>
        <table className="mlp-table">
          <tbody>
            <tr>
              <th>Finalité</th>
              <td>Créer et sécuriser votre compte, fournir les fonctions MANUFEO, synchroniser vos données et permettre le travail multi-appareils.</td>
            </tr>
            <tr>
              <th>Gestion métier</th>
              <td>Créer et conserver les informations nécessaires aux clients, devis, factures, chantiers, équipes et suivis associés.</td>
            </tr>
            <tr>
              <th>Assistance IA et vocale</th>
              <td>Transcrire une dictée ou structurer une demande lorsque vous déclenchez volontairement ces fonctions.</td>
            </tr>
            <tr>
              <th>Communication</th>
              <td>Envoyer les messages d’authentification, documents et notifications demandés par l’utilisateur.</td>
            </tr>
            <tr>
              <th>Sécurité</th>
              <td>Prévenir les abus, protéger les comptes, diagnostiquer les erreurs et maintenir la disponibilité du service.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Selon le traitement concerné, la base juridique est principalement l’exécution du service
          demandé ou les mesures précontractuelles, le respect d’obligations légales et l’intérêt
          légitime de MANUFEO à sécuriser et améliorer son service.
        </p>
      </section>

      <section className="mlp-section">
        <h2>4. Données de vos propres clients et collaborateurs</h2>
        <p>
          Lorsqu’un professionnel utilise MANUFEO pour enregistrer des informations relatives à ses
          propres clients, salariés, sous-traitants ou contacts de chantier, ce professionnel reste
          responsable de la licéité de cette collecte et de l’information des personnes concernées.
          Pour ces données saisies pour le compte de l’entreprise utilisatrice, MANUFEO intervient
          comme prestataire technique et traite les données afin de fournir le service demandé.
        </p>
      </section>

      <section className="mlp-section">
        <h2>5. Prestataires techniques</h2>
        <p>MANUFEO s’appuie notamment, selon les fonctions utilisées, sur les prestataires suivants :</p>
        <ul>
          <li><strong>Vercel</strong> pour l’hébergement et l’exécution de l’application ;</li>
          <li><strong>Supabase</strong> pour l’authentification, la base de données et le stockage applicatif ;</li>
          <li><strong>Resend</strong> pour l’envoi d’e-mails transactionnels et de documents ;</li>
          <li><strong>Groq</strong> pour la transcription vocale lorsque cette fonction est utilisée ;</li>
          <li><strong>DeepSeek</strong> pour certaines fonctions de compréhension et de structuration assistées par IA.</li>
        </ul>
        <p>
          Ces prestataires peuvent traiter des données hors de l’Espace économique européen selon
          leur infrastructure et leurs propres sous-traitants. Lorsque cela est requis, ces transferts
          doivent être encadrés par les mécanismes prévus par la réglementation applicable.
        </p>
      </section>

      <section className="mlp-section">
        <h2>6. Durées de conservation</h2>
        <p>
          Les données du compte et de l’espace entreprise sont conservées pendant la durée nécessaire
          à la fourniture du service puis, lorsque cela est requis, pendant les délais permettant de
          respecter les obligations légales, comptables ou de preuve. Les journaux techniques et de
          sécurité sont conservés pour une durée proportionnée à leur finalité. Les données supprimées
          peuvent subsister temporairement dans des sauvegardes techniques avant leur rotation.
        </p>
      </section>

      <section className="mlp-section">
        <h2>7. Sécurité</h2>
        <p>
          MANUFEO met en œuvre des mesures destinées à limiter l’accès aux données aux membres de
          l’organisation concernée, notamment des contrôles d’accès, l’authentification, des règles
          d’isolation des données et un stockage privé pour les photos de chantier. Aucun système ne
          pouvant garantir une sécurité absolue, les utilisateurs doivent également protéger leurs
          identifiants et signaler rapidement toute suspicion d’accès non autorisé.
        </p>
      </section>

      <section className="mlp-section">
        <h2>8. Cookies et stockage local</h2>
        <p>
          La version actuelle de MANUFEO utilise des mécanismes techniques nécessaires à la session,
          à la sécurité, à la synchronisation et à la conservation de préférences ou de données de
          travail. MANUFEO n’intègre pas, à ce jour, de dispositif de ciblage publicitaire sur son site.
          Si des outils non strictement nécessaires étaient ajoutés, cette politique et, le cas échéant,
          le mécanisme de recueil du consentement seraient adaptés.
        </p>
      </section>

      <section className="mlp-section">
        <h2>9. Vos droits</h2>
        <p>
          Dans les conditions prévues par le RGPD, vous pouvez demander l’accès à vos données, leur
          rectification, leur effacement, la limitation de certains traitements, leur portabilité ou
          vous opposer à certains traitements. Vous pouvez également retirer un consentement lorsqu’un
          traitement repose sur celui-ci.
        </p>
        <p>
          Pour exercer vos droits :
          {" "}<a href="mailto:noe.anterieux@importmarginguard.fr">noe.anterieux@importmarginguard.fr</a>.
          Vous disposez également du droit d’introduire une réclamation auprès de la CNIL.
        </p>
      </section>

      <section className="mlp-section">
        <h2>10. Évolution de cette politique</h2>
        <p>
          Cette politique peut évoluer avec les fonctionnalités, les prestataires ou le cadre juridique.
          La date de mise à jour affichée sur cette page permet d’identifier la version en vigueur.
        </p>
      </section>
    </LegalPublicPage>
  );
}
