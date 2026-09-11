import type { Metadata } from "next";
import LegalPublicPage from "../legal-public-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente — MANUFEO",
  description: "Conditions générales de vente du service professionnel MANUFEO.",
};

export default function CgvPage() {
  return (
    <LegalPublicPage
      eyebrow="Conditions contractuelles"
      title="Conditions générales de vente"
      intro="Conditions applicables à l’utilisation professionnelle de MANUFEO. La version commerciale définitive sera complétée avec l’identité de l’entité contractante avant toute souscription payante."
    >
      <p className="mlp-note mlp-warning">
        <strong>Version pilote.</strong> MANUFEO est actuellement proposé à des fins de test.
        Aucun abonnement payant n’est réputé souscrit tant qu’une activation commerciale explicite,
        accompagnée du prix et des conditions applicables, n’a pas été acceptée par le client.
        Les coordonnées juridiques complètes du fournisseur seront ajoutées avant cette ouverture.
      </p>

      <section className="mlp-section">
        <h2>1. Objet et champ d’application</h2>
        <p>
          Les présentes conditions encadrent l’accès et l’utilisation de MANUFEO, logiciel en ligne
          de gestion destiné aux artisans, entreprises et autres professionnels du bâtiment.
          MANUFEO est un service exclusivement destiné à un usage professionnel.
        </p>
        <p>
          Toute condition particulière, devis, bon de commande ou offre commerciale expressément
          acceptée prévaut sur les présentes CGV en cas de contradiction.
        </p>
      </section>

      <section className="mlp-section">
        <h2>2. Services proposés</h2>
        <p>
          Selon la formule et l’état d’avancement du produit, MANUFEO peut notamment permettre la
          gestion de clients, devis, factures, encaissements, chantiers, collaborateurs, photos,
          agenda, documents et fonctions d’assistance vocale ou par intelligence artificielle.
        </p>
        <p>
          Les fonctionnalités peuvent évoluer afin d’améliorer le service, sa sécurité ou sa conformité.
          Une évolution substantielle affectant une offre payante sera portée à la connaissance du client
          dans des conditions raisonnables.
        </p>
      </section>

      <section className="mlp-section">
        <h2>3. Création du compte et accès</h2>
        <p>
          Le client fournit des informations exactes et à jour lors de la création de son compte et de
          son profil entreprise. Il est responsable de la confidentialité de ses identifiants, des accès
          accordés à ses collaborateurs et des opérations réalisées depuis son organisation.
        </p>
        <p>
          MANUFEO peut suspendre un accès en cas de risque de sécurité, utilisation frauduleuse,
          violation grave des présentes conditions ou nécessité technique urgente.
        </p>
      </section>

      <section className="mlp-section">
        <h2>4. Prix</h2>
        <p>
          Le tarif public de référence actuellement affiché est de <strong>99 € HT par mois</strong>.
          Le prix réellement applicable est celui présenté au client au moment de la souscription ou
          figurant dans une offre commerciale acceptée. Les taxes applicables sont ajoutées selon la
          réglementation en vigueur.
        </p>
        <p>
          Sauf mention contraire dans une offre écrite, aucune réduction de prix ni aucun escompte pour
          paiement anticipé n’est accordé.
        </p>
      </section>

      <section className="mlp-section">
        <h2>5. Facturation et règlement</h2>
        <p>
          Lorsqu’une offre payante sera activée, la périodicité, le moyen de paiement et la date
          d’échéance seront indiqués lors de la souscription et sur les factures correspondantes.
          Sauf condition particulière acceptée, les sommes facturées sont payables à leur échéance.
        </p>
        <p>
          En cas de retard de paiement entre professionnels, des pénalités sont exigibles de plein droit
          à compter du jour suivant la date d’échéance, sans rappel préalable. Le taux applicable est le
          taux de la Banque centrale européenne à son opération de refinancement la plus récente majoré
          de 10 points de pourcentage, sans pouvoir être inférieur à trois fois le taux d’intérêt légal.
          Une indemnité forfaitaire de <strong>40 €</strong> pour frais de recouvrement est également due,
          sans préjudice d’une indemnisation complémentaire sur justificatifs lorsque les frais exposés
          sont supérieurs.
        </p>
      </section>

      <section className="mlp-section">
        <h2>6. Durée, renouvellement et résiliation</h2>
        <p>
          Les modalités de durée et de renouvellement sont celles affichées au moment de la souscription.
          Sauf engagement particulier expressément accepté, une formule mensuelle peut être résiliée pour
          l’avenir avant son prochain renouvellement selon les moyens proposés dans l’application ou en
          contactant MANUFEO.
        </p>
        <p>
          La résiliation n’efface pas les sommes déjà dues et n’empêche pas la conservation des données
          devant être gardées pour répondre à une obligation légale ou assurer la preuve des opérations.
        </p>
      </section>

      <section className="mlp-section">
        <h2>7. Obligations du client</h2>
        <p>Le client s’engage notamment à :</p>
        <ul>
          <li>utiliser MANUFEO dans le cadre de son activité professionnelle et conformément à la loi ;</li>
          <li>ne pas introduire de contenu illicite, malveillant ou portant atteinte aux droits de tiers ;</li>
          <li>disposer d’une base légale pour les données personnelles de clients, salariés ou partenaires qu’il enregistre ;</li>
          <li>vérifier ses devis, factures, prix, quantités, taux, coordonnées et pièces jointes avant validation ou envoi ;</li>
          <li>maintenir des moyens d’accès raisonnablement sécurisés et signaler sans délai toute compromission connue.</li>
        </ul>
      </section>

      <section className="mlp-section">
        <h2>8. Assistance vocale et intelligence artificielle</h2>
        <p>
          Les fonctions automatisées de MANUFEO sont conçues pour assister l’utilisateur, pas pour se
          substituer à son jugement professionnel. Une transcription, estimation, proposition de ligne,
          classification ou suggestion peut contenir une erreur ou une information incomplète.
        </p>
        <p>
          Le client demeure seul responsable de la vérification et de la validation finale des documents
          commerciaux, comptables ou de chantier qu’il utilise ou transmet à un tiers.
        </p>
      </section>

      <section className="mlp-section">
        <h2>9. Disponibilité, maintenance et évolution</h2>
        <p>
          MANUFEO met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité du
          service. Des interruptions peuvent néanmoins intervenir pour maintenance, mise à jour, incident
          de réseau, défaillance d’un prestataire ou événement extérieur. Sauf engagement écrit spécifique,
          aucun niveau de service garanti n’est attaché à la phase pilote.
        </p>
      </section>

      <section className="mlp-section">
        <h2>10. Données et confidentialité</h2>
        <p>
          Les traitements de données sont décrits dans la
          {" "}<a href="/politique-confidentialite">Politique de confidentialité</a>. Le client reste
          responsable des données qu’il importe dans son espace et des droits nécessaires à leur traitement.
          MANUFEO s’engage à ne pas utiliser ces données à des fins étrangères à la fourniture, à la sécurité
          ou à l’amélioration légitime du service sans base juridique appropriée.
        </p>
      </section>

      <section className="mlp-section">
        <h2>11. Propriété intellectuelle</h2>
        <p>
          Le client bénéficie, pendant la durée de son droit d’accès, d’un droit personnel, non exclusif et
          non transférable d’utiliser MANUFEO pour les besoins internes de son activité. Aucun droit de
          propriété sur le logiciel, la marque ou les éléments propres à MANUFEO n’est transféré.
        </p>
        <p>
          Le client conserve ses droits sur les contenus, documents et données qu’il renseigne dans le service.
        </p>
      </section>

      <section className="mlp-section">
        <h2>12. Responsabilité</h2>
        <p>
          Chaque partie répond des dommages directs résultant de ses manquements prouvés. MANUFEO ne peut
          être tenu responsable d’un préjudice résultant d’une information non vérifiée par l’utilisateur,
          d’une mauvaise utilisation du service, d’un accès compromis imputable au client ou d’un événement
          échappant raisonnablement à son contrôle.
        </p>
        <p>
          Pour une offre payante, et sauf disposition légale impérative contraire, la responsabilité totale
          de MANUFEO au titre du service pourra être plafonnée au montant hors taxes effectivement payé par le
          client au cours des douze mois précédant le fait générateur. Cette limitation ne s’applique pas aux
          cas dans lesquels la loi interdit un tel plafonnement.
        </p>
      </section>

      <section className="mlp-section">
        <h2>13. Force majeure</h2>
        <p>
          Aucune partie n’est responsable d’un manquement causé par un événement répondant aux critères de
          la force majeure au sens du droit français, pendant la durée où cet événement empêche raisonnablement
          l’exécution de l’obligation concernée.
        </p>
      </section>

      <section className="mlp-section">
        <h2>14. Droit applicable et litiges</h2>
        <p>
          Les présentes CGV sont soumises au droit français. Les parties s’efforcent de rechercher une solution
          amiable avant toute action contentieuse. À défaut d’accord, le litige relève des juridictions
          compétentes déterminées par les règles de procédure applicables.
        </p>
      </section>

      <section className="mlp-section">
        <h2>15. Contact</h2>
        <p>
          Pour toute question contractuelle ou commerciale :
          {" "}<a href="mailto:noe.anterieux@importmarginguard.fr">noe.anterieux@importmarginguard.fr</a>.
        </p>
      </section>
    </LegalPublicPage>
  );
}
