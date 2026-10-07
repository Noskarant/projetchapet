# Sécurité de MANUFEO

Pour signaler un problème, utilisez le contact de support indiqué dans l’application. Ne publiez pas de données client, de clés, de jetons, ni une procédure d’exploitation dans une issue publique.

Avant une mise en production : tests unitaires et navigateur, contrôle des dépendances avec le lockfile, vérification des rôles/RLS et des migrations concernées. Un audit indisponible ne vaut pas un contrôle réussi.

Les clés de service restent sur le serveur. Les modes de test sont interdits dans un déploiement Vercel de production. Les fonctions sensibles contrôlent l’utilisateur, sa session active, l’entreprise et le rôle avant d’accéder aux données ou aux fournisseurs.

Après une modification des permissions, exécuter aussi `supabase/tests/security-audit.sql` dans une connexion SQL privilégiée : ce contrôle utilise des comptes fictifs et termine par ROLLBACK. Ne pas retirer le ROLLBACK.

Le rapport du 7 octobre 2026 décrit le périmètre vérifié et les points restant à confirmer dans la configuration des plateformes. Il ne constitue pas une certification de sécurité.
