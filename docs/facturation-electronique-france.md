# Préparation à la facturation électronique française

Mise à jour : août 2026.

## Calendrier réglementaire

- **1er septembre 2026** : toutes les entreprises établies en France et assujetties à la TVA doivent pouvoir **recevoir** des factures électroniques.
- **1er septembre 2026** : les grandes entreprises et les ETI doivent également **émettre** électroniquement leurs factures et transmettre les données de e-reporting.
- **1er septembre 2027** : les PME et micro-entreprises doivent à leur tour émettre électroniquement leurs factures et transmettre les données de e-reporting.

Sources officielles :

- Ministère de l’Économie : https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises
- DGFiP — plateformes agréées : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- DGFiP — émission, réception et transmission : https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais
- Décret n° 2022-1299, article 3 : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000046385051

## Architecture retenue pour le produit

Le logiciel reste l’interface métier utilisée par l’artisan. Il ne doit pas chercher à devenir lui-même une plateforme agréée.

À la commercialisation, il devra se connecter par API à une **plateforme agréée** afin de couvrir :

1. l’émission des factures électroniques ;
2. la réception des factures fournisseurs ;
3. l’identification du destinataire dans l’annuaire ;
4. la transmission des données réglementaires ;
5. le e-reporting des transactions et des paiements ;
6. le suivi des statuts du cycle de vie ;
7. la gestion des rejets et corrections.

## Formats à prévoir

L’architecture documentaire doit pouvoir produire ou transmettre les trois formats du socle français :

- **Factur-X** ;
- **UBL** ;
- **CII**.

Le PDF visuel actuel reste utile pour l’utilisateur, mais il ne suffit pas à lui seul pour constituer une facture électronique réglementaire.

## Données à conserver dans le logiciel

### Émetteur

- raison sociale ;
- SIREN/SIRET ;
- numéro de TVA intracommunautaire ;
- adresse complète ;
- coordonnées de règlement ;
- régime et mentions fiscales utiles.

### Client

- type de client : professionnel, particulier ou organisme public ;
- SIREN/SIRET lorsque pertinent ;
- numéro de TVA ;
- adresse de facturation ;
- adresse de livraison si différente ;
- identifiant de routage fourni par la plateforme agréée.

### Facture

- numéro unique et chronologique ;
- dates d’émission, d’échéance, de livraison ou de prestation ;
- nature de l’opération ;
- lignes structurées avec quantités, unités, prix HT et TVA ;
- totaux HT, TVA et TTC ;
- référence au devis ou à la commande ;
- données de paiement ;
- statut de cycle de vie ;
- identifiant technique de la plateforme.

## Statuts techniques futurs

Le modèle serveur devra distinguer les statuts métier des statuts réglementaires :

- brouillon ;
- prête à transmettre ;
- déposée ;
- émise ;
- reçue ;
- mise à disposition ;
- rejetée ;
- refusée ;
- encaissée ;
- annulée ou corrigée par avoir.

## Étapes d’intégration après validation de Philippe

1. sélectionner une plateforme agréée disposant d’une API adaptée aux TPE/PME ;
2. créer les comptes, l’authentification et la séparation multi-entreprises ;
3. migrer les données locales vers Supabase ;
4. ajouter les champs réglementaires manquants ;
5. générer le format structuré requis ;
6. connecter l’annuaire et les API d’émission/réception ;
7. synchroniser les statuts et les paiements ;
8. journaliser les transmissions et erreurs ;
9. effectuer les tests d’interopérabilité avec la plateforme choisie.

## Périmètre de la démonstration actuelle

Le centre de préparation visible dans l’application présente le calendrier, contrôle les données disponibles et identifie les briques restantes. Il n’envoie aucune facture réglementaire réelle tant que la plateforme agréée n’est pas sélectionnée et connectée.
