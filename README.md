# Projet Chapet — prototype métier

Prototype responsive d’un SaaS de devis, facturation et pilotage pour les artisans et petites entreprises du bâtiment.

## Ce que contient le prototype

- tableau de bord métier avec CA, encaissements, pipeline et comparaison N-1 ;
- listes de devis avec recherche, filtres et états lisibles ;
- simulation interactive de création vocale d’un devis ;
- factures avec paiement, retards et indicateurs ;
- fiches clients professionnels et particuliers ;
- agenda partagé ;
- paramètres d’entreprise et exercice comptable ;
- interfaces dédiées desktop, tablette et mobile ;
- structure PWA installable ;
- migration SQL Supabase initiale prête à appliquer.

Les données de démonstration sont locales : aucune facture réelle n’est créée et aucun document n’est envoyé.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Supabase

1. Créer un projet Supabase dédié.
2. Appliquer `supabase/migrations/20260729180000_initial_schema.sql`.
3. Copier `.env.example` vers `.env.local`.
4. Renseigner :

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

La route `/api/health` indique si les variables Supabase sont configurées.

## Déploiement Vercel

Importer le dépôt GitHub dans Vercel, conserver la configuration Next.js automatique et ajouter les variables Supabase aux environnements Preview et Production.

## Statut

Prototype d’interface destiné à valider les parcours avec Philippe et les premiers bêta-testeurs. La facturation électronique, la génération PDF légale, l’envoi d’e-mails, la signature et les paiements seront développés et testés séparément avant toute commercialisation.
