# Parcours artisan — septembre 2026

L’interface terrain est utilisée sur téléphone, tablette et ordinateur. L’interface ERP et l’entrée de menu « Copilote chantier » ne sont plus présentées. La mascotte n’a pas été modifiée.

## Documents et agenda

- La cloche affiche un point rouge quand des notifications métier existent.
- Les tâches terminées quittent l’agenda actif et restent consultables et réouvrables dans « Événements terminés ».
- Un devis lié à une facture affiche « Facturé ». Le statut peut être remis en attente.
- Un geste horizontal sur un poste du devis révèle sa suppression en rouge ; un bouton accessible offre la même action.
- L’onglet PDF ouvre un affichage plein écran.
- Une RSE ou majoration dictée en pourcentage crée des postes recalculables, répartis selon les taux de TVA des travaux. La remise globale du devis est conservée à sa conversion en facture.

## Entreprise et rentabilité

La date du bilan règle le début de l’exercice suivant. Le pilotage propose exercice en cours, mois en cours, trois ou six mois glissants, dates libres ; N−1 compare la même période de l’année précédente.

Les coûts réels confirmés de l’entreprise alimentent des estimations de main-d’œuvre, matériaux, déplacements et sous-traitance. Les chantiers comparables sont privilégiés, avec une médiane des coûts rapportés au montant HT. Les estimations sont indiquées comme telles et restent à confirmer : aucune donnée d’un autre artisan n’est utilisée.

## Factures et comptable

Dans Mon entreprise, renseigner le mail du comptable puis activer les automatismes voulus :

- Dossier mensuel : une archive ZIP contenant chaque facture et avoir du mois précédent en PDF, ainsi qu’un CSV, accompagnée du récapitulatif. Les brouillons sont exclus.
- Copie automatique de chaque facture émise au comptable.
- Dépôt automatique PDP : nécessite une connexion SUPER PDP effective et les informations réglementaires complètes de l’entreprise et du client.

Le cron quotidien reprend les envois encore à traiter. Les réservations et accusés évitent les envois concurrents ; un accusé incertain nécessite vérification avant renvoi. Une archive supérieure à 25 Mo reste à traiter manuellement. Activer les copies automatiques peut traiter également les factures existantes non encore enregistrées dans le journal d’envoi.

Configuration serveur nécessaire : SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL et CRON_SECRET. La PDP exige également sa configuration OAuth et EINVOICE_SECRET. Aucune transmission réelle ni aucun e-mail n’a été envoyé lors des vérifications locales.

## Fournisseurs et e-mails reçus

Les fiches fournisseurs sont sauvegardées dans l’entreprise. Une demande de prix peut être envoyée depuis la fiche ou dictée ; le fournisseur est résolu sans choix arbitraire, et le mail part après la validation habituelle des actions. Les commandes fermes restent en brouillon.

Un e-mail reçu peut être collé ou importé au format .eml pour créer une fiche chantier. Deux imports identiques ne créent pas deux chantiers. Le devis reste à préparer et valider. La réception automatique par transfert vers une adresse MANUFEO n’est pas raccordée : elle nécessite une adresse de réception et un webhook. L’import .eml gère les en-têtes et le texte simple ; les pièces jointes et encodages MIME complexes ne sont pas interprétés.

## Collaborateurs et sécurité

Les collaborateurs peuvent être créés avec coordonnées et notes. Le responsable peut inviter leur compte et révoquer ses anciennes sessions en envoyant un lien de récupération au même e-mail : les données cloud restent attachées au compte. Les données jamais synchronisées d’un appareil perdu ne sont pas récupérables.

Les comptes terrain utilisent un espace séparé pour leurs chantiers affectés, tâches et photos. Les politiques SQL interdisent leur accès aux documents financiers et aux snapshots financiers. Les RPC financiers vérifient les rôles ; les sessions révoquées sont rejetées par les API et les fonctions d’autorisation SQL. Les tokens PDP sont chiffrés côté serveur. Les réponses utilisent des en-têtes de sécurité et les API sont limitées en fréquence.

Ces corrections ne constituent pas une certification de sécurité commerciale. Avant commercialisation, restent notamment à valider : audit complet, restauration de sauvegarde, protection Supabase contre les mots de passe compromis, comptes et rôles réels, envois réels comptable et PDP, et Safari iPad. L’animation vocale est apaisée ; le son d’ouverture est discret et désactivable, sous réserve de l’autorisation audio du navigateur.
