# Sauvegarde des données MANUFEO

L’accès à MANUFEO passe par un compte Supabase Auth. Les clients, devis et factures sont enregistrés dans les tables de l’entreprise et synchronisés avec le mobile. Les chantiers et collaborateurs sont également enregistrés côté serveur. Le profil de l’entreprise, dont le logo, est enregistré dans un snapshot cloud par entreprise. Les notes personnelles du devis sont placées dans une table distincte lisible par les rôles `owner` et `admin` uniquement.

Un nouveau téléphone ou ordinateur récupère les données après connexion avec le même compte. Un document en attente de synchronisation reste temporairement sur l’appareil : attendre la fin de la synchronisation avant de le réinitialiser ou de se déconnecter. L’application affiche un état de sauvegarde dans le menu du compte. Les PDF téléchargés dans les fichiers personnels de l’appareil restent sous la responsabilité de l’utilisateur.

Les tables utilisent des politiques de sécurité par entreprise (RLS). Les factures émises retirées de la liste active sont archivées : elles restent disponibles dans les archives mensuelles. Les brouillons de facture peuvent être supprimés réellement. L’envoi automatique mensuel au comptable ne se déclenche que si l’adresse du comptable est renseignée et que l’option correspondante a été activée. Chaque relevé comporte le PDF récapitulatif et un CSV ; un enregistrement par entreprise et par mois évite un second envoi.

Les garanties d’hébergement, la durée de conservation des sauvegardes et les engagements contractuels nécessitent la vérification des paramètres effectifs du projet Supabase et du contrat d’hébergement. Le code seul ne permet pas de garantir l’absence de panne ou une restauration à un instant donné.
