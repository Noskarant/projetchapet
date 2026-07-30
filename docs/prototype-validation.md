# Validation du prototype

Ce lot conserve volontairement :

- les données fictives de l’entreprise et des clients ;
- l’accès direct sans page de connexion ;
- l’absence de Stripe, de pricing et d’abonnement ;
- le design mobile et desktop existant.

Contrôles automatisés :

- TypeScript strict ;
- tests de migration et récupération du workspace mobile ;
- build Next.js de production.

Le service worker ne met jamais en cache les routes `/api/` ni les appels Supabase.
