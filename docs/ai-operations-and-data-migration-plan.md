# MANUFEO — architecture IA opérationnelle et migration des données

## Objectif produit

Faire évoluer MANUFEO vers un modèle simple à comprendre pour l’artisan :

**Parler / envoyer une information → MANUFEO prépare → l’artisan vérifie → MANUFEO exécute.**

Le LLM ne doit jamais écrire directement dans les tables métier. Toute action sensible passe par les services métier existants et une confirmation explicite.

## 1. Action engine commun à toutes les entrées

### Entrées

- voix ;
- texte ;
- e-mail ;
- photo/document ;
- formulaire existant ;
- événements internes (devis accepté, facture en retard, chantier planifié).

### Pipeline

1. `capture` : conserver la source brute et son contexte organisation/utilisateur ;
2. `interpret` : produire un JSON strict d’intentions et d’entités ;
3. `resolve` : rattacher client, chantier, devis, fournisseur, produit et utilisateur existants ;
4. `validate` : appliquer les règles métier déterministes ;
5. `propose` : créer une ou plusieurs actions en attente ;
6. `review` : afficher ce qui va changer, les incertitudes et les champs manquants ;
7. `confirm` : demander une confirmation explicite pour chaque groupe d’actions sensibles ;
8. `execute` : appeler les services métier existants côté serveur ;
9. `audit` : conserver source, proposition, validation, résultat et auteur.

### Modèle recommandé

Une table `action_proposals` par organisation :

- `id`, `organization_id`, `created_by` ;
- `source_type`, `source_reference`, `raw_text` ;
- `intent_type` ;
- `payload` JSON validé par schéma ;
- `risk_level` (`low`, `review`, `explicit_confirmation`) ;
- `status` (`draft`, `needs_input`, `ready`, `confirmed`, `executed`, `rejected`, `failed`) ;
- `confidence`, `warnings`, `missing_fields` ;
- `created_at`, `confirmed_at`, `executed_at`.

Exemples d’intentions : `create_customer`, `prepare_quote`, `update_project_note`, `prepare_supplier_order`, `schedule_task`, `prepare_invoice`, `mark_payment`, `prepare_email`.

## 2. Vocal IA

Le vocal est une interface de saisie rapide, pas un agent autonome.

Flux :

`audio → transcription → intention structurée → aperçu → préremplissage / proposition → validation`.

Le moteur actuel peut être conservé, mais il doit progressivement émettre des `action_proposals` plutôt que manipuler directement le DOM. Cela rendra le même moteur utilisable sur desktop, mobile et futures intégrations.

## 3. Copilote métier

Le copilote doit raisonner sur les données propres à l’entreprise :

- prix de vente historiques ;
- coûts matière ;
- fournisseurs habituels ;
- temps réels par type de prestation ;
- coût horaire par profil ;
- marges cibles ;
- remises habituelles ;
- incidents et écarts constatés sur les chantiers précédents.

Les calculs financiers restent déterministes. Le modèle IA sert à comprendre le chantier, proposer des catégories de travaux, repérer les omissions et formuler des questions.

La sortie doit séparer :

- faits compris ;
- hypothèses ;
- données provenant du catalogue de l’entreprise ;
- valeurs génériques ;
- questions à poser ;
- prestations proposées ;
- coût estimé ;
- heures estimées ;
- marge estimée ;
- alertes de marge et risques.

## 4. Mémoire entreprise

Ne pas utiliser une simple mémoire textuelle globale. Construire un contexte organisé par entreprise à partir des tables métier.

Créer progressivement des agrégats tels que :

- `company_trade_metrics` : temps moyen, coût moyen et prix moyen par prestation ;
- `supplier_price_history` : dernier prix, moyenne, variation, fournisseur ;
- `customer_commercial_history` : fréquence, panier, délais de paiement ;
- `project_actuals` : prévu vs réel en heures, matière et marge.

Le copilote lit ces données par l’organisation courante et explique toujours l’origine d’un chiffre important.

## 5. Migration de données concurrents / ancien logiciel

### V1 recommandée : fichiers exportés

Commencer par CSV/XLSX/PDF structurés plutôt que par connexion directe aux comptes concurrents.

Priorité d’import :

1. clients et contacts ;
2. catalogue articles/prestations/prix ;
3. fournisseurs ;
4. devis ;
5. factures et statuts ;
6. paiements ;
7. chantiers ;
8. pièces jointes si le format d’export le permet.

### Pipeline d’import sûr

1. upload dans un espace temporaire privé ;
2. détection du format/source ;
3. parsing sans écrire dans les tables métier ;
4. stockage dans des tables de staging ;
5. mapping des colonnes avec suggestions automatiques ;
6. écran d’aperçu : lignes valides, lignes rejetées, doublons, champs manquants ;
7. simulation (`dry run`) ;
8. confirmation par l’administrateur ;
9. import transactionnel par lots ;
10. rapport final et journal d’audit.

### Tables recommandées

`import_jobs`

- organisation, auteur, nom du fichier, source présumée, état, compteurs, dates.

`import_staging_rows`

- job, type d’entité, index source, données brutes, données normalisées, erreurs, statut.

`external_source_links`

- organisation, système source, type d’entité, identifiant source, identifiant MANUFEO.

Cette dernière table rend l’import idempotent : réimporter le même fichier ne doit pas recréer les mêmes clients ou documents.

### Déduplication

Clients : priorité SIRET, puis e-mail/téléphone, puis nom + adresse avec confirmation humaine en cas d’ambiguïté.

Documents : identifiant source, numéro de document, client, date et montant.

Ne jamais fusionner automatiquement deux entités avec une confiance faible.

### Rollback

Chaque création issue d’un import reçoit `import_job_id`. Tant que les données importées n’ont pas été modifiées manuellement, un administrateur doit pouvoir annuler le lot en sécurité.

## 6. Mesure de valeur à afficher au client

Instrumenter les workflows pour estimer :

- minutes de saisie évitées par le vocal ;
- documents préremplis par IA ;
- relances préparées ;
- erreurs/omissions détectées ;
- marge potentiellement protégée ;
- factures en retard récupérées ;
- temps économisé sur la migration initiale.

Le tableau de bord peut ensuite afficher une valeur mensuelle compréhensible : `temps gagné`, `marge protégée`, `encaissements suivis`.

## 7. Ordre d’implémentation recommandé

1. finaliser le tutoriel guidé et le premier parcours vocal ;
2. introduire `action_proposals` sans changer l’UX existante ;
3. faire passer le vocal desktop/mobile par ce moteur commun ;
4. brancher le copilote sur les données propres à l’entreprise ;
5. ajouter les premières actions transversales (client + devis + tâche + note chantier) ;
6. construire l’import clients/catalogue en staging ;
7. étendre l’import aux documents et chantiers ;
8. mesurer automatiquement la valeur produite par MANUFEO.

Cet ordre minimise les régressions : chaque étape peut être livrée derrière un feature flag et testée sur le pilote avant de remplacer le flux précédent.
