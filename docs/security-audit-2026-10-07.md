# MANUFEO — audit de sécurité et sécurisation du 7 octobre 2026

## Résultat et portée

L’audit a trouvé des défauts d’autorisation réels, reproduits avec des comptes fictifs, puis corrigés dans le code et dans la base. Les vérifications ne se limitent pas au scanner de dépendances : elles couvrent les appels API, les permissions SQL directes, les fonctions privilégiées, les sessions, les fichiers et les protections du navigateur.

La configuration Auth conserve une alerte sur les mots de passe compromis. Certaines garanties d’exploitation doivent encore être vérifiées dans les consoles des plateformes avant le lancement commercial. Ce document distingue ces points des protections effectivement appliquées ; il ne constitue pas une certification ni une garantie d’absence de toute vulnérabilité.

**Périmètre :** code du dépôt, historique Git disponible localement, dépendances de production et de développement, API Next.js, Supabase de production, métadonnées Vercel, navigateur Chromium et WebKit. Stripe, les applications natives et les infrastructures internes des fournisseurs ne font pas partie de cette validation.

**Méthode :** revue suivant les risques OWASP API, inspection des politiques et privilèges, tests adverses sans envoi réel d’e-mails, tests SQL dans des transactions terminées par ROLLBACK, contrôles fonctionnels et CI avant publication. Aucun compte client réel n’a changé de rôle. Aucun utilisateur fictif n’a été conservé en production.

## Défauts corrigés

| Référence | Gravité | Constat | Correction et preuve |
| --- | --- | --- | --- |
| SEC-01 | Haute | Six anciens endpoints IA/audio n’exigeaient pas de connexion. Un appel direct pouvait consommer les crédits des fournisseurs. | Authentification et session active avant lecture audio ou appel fournisseur ; rôle métier pour les actions financières. Les six endpoints renvoient 401 sans aucun appel réseau dans le test anonyme. Tous les écrans de dictée transmettent désormais leur session. |
| SEC-02 | Haute | Les permissions SQL permettaient à un administrateur de modifier son propre rôle en propriétaire, malgré le contrôle dans l’interface. | Garde au niveau SQL : identité du membre immuable, propriétaire et rôle propre protégés, gestion des administrateurs réservée au propriétaire. Les invitations ne permettent pas de contourner cette règle. Le contournement a été reproduit avant correction puis refusé après correction. |
| SEC-03 | Haute | Un salarié pouvait lire directement des chantiers non affectés, leurs notes et certaines données commerciales. | Accès aux notes limité aux affectations ; données commerciales brutes, commandes, catalogue de prix, signatures, historique financier et fichiers bruts réservés aux rôles autorisés. Le salarié utilise l’API terrain qui retourne uniquement ses chantiers et les consignes adaptées. Tests SQL et API d’accès aux chantiers non affectés. |
| SEC-04 | Moyenne | Un comptable pouvait enregistrer ou modifier des paiements via REST. | Lecture comptable conservée, écriture réservée aux rôles opérationnels. Test réel SQL : paiement visible mais INSERT refusé et UPDATE sans effet. |
| SEC-05 | Moyenne | Les clés étrangères des devis/factures ne garantissaient pas à elles seules que le client et le devis lié appartiennent à la même entreprise. | Garde SQL de cohérence d’entreprise, y compris lors d’un appel REST direct. Références croisées refusées ; écriture normale conservée. Aucun lien interentreprise existant trouvé lors du contrôle agrégé. |
| SEC-06 | Moyenne | La vérification serveur de session était ignorée si la clé de service manquait ; les politiques ne vérifiaient pas la date limite de session. | Échec fermé en 503 sans clé ; sessions expirées, supprimées et utilisateurs bloqués refusés. Les fonctions de création d’entreprise vérifient aussi la session. Tests de session falsifiée/révoquée et RLS avec session expirée. |
| SEC-07 | Moyenne | La récupération d’un compte par un administrateur pouvait révoquer les sessions du propriétaire ou d’un autre administrateur. | Refus avant révocation et avant envoi du lien. Les sessions du propriétaire se gèrent depuis son propre compte ; seuls les propriétaires gèrent les administrateurs. |
| SEC-08 | Moyenne | La limite IA en mémoire était indépendante sur chaque serveur et dépendait de l’adresse IP déclarée. | Quotas atomiques stockés côté serveur : 120 demandes par utilisateur/minute et 2 000 par entreprise/jour, partagés entre les routes IA concernées. Le client ne peut pas appeler la fonction de quota. Une limite atteinte renvoie 429 avant l’appel payant ; une indisponibilité du compteur bloque l’appel. |
| SEC-09 | Moyenne | Les corps JSON/audio étaient parfois entièrement chargés avant vérification de leur taille. | Lecture des flux bornée et annulation immédiate au dépassement, même sans Content-Length. Limites appliquées aux uploads et aux dernières routes JSON non bornées. Test d’un flux continu surdimensionné. |
| SEC-10 | Renforcement | La politique navigateur n’encadrait pas l’exécution des scripts. | CSP avec nonce aléatoire par réponse, interdiction des attributs script et du code évalué en production, destinations de connexion explicites, conservation des workers/PDF nécessaires. Rendu HTML dynamique pour que les scripts Next reçoivent le nonce. Test de HTML injecté et d’attribut onclick, plus validation de l’interface hydratée. |
| SEC-11 | Renforcement | Les messages d’erreur privilégiés pouvaient divulguer des détails internes. | Messages attendus conservés ; erreurs d’infrastructure remplacées par un message générique, également dans les résultats d’actions enregistrés. Statuts 401/403/503 conservés. |
| SEC-12 | Renforcement | Les installations n’étaient pas figées par un lockfile et un échec réseau du scanner pouvait laisser la CI verte. | Lockfile commité, `npm ci` dans les workflows, audit comprenant les dépendances de développement. Un scanner indisponible ne vaut plus un audit réussi. Suivi hebdomadaire des dépendances et actions via Dependabot. |
| SEC-13 | Moyenne | Après un changement de compte vers une entreprise vide, la synchronisation pouvait importer le cache local de l’ancienne entreprise. | Vérification de l’entreprise du cache avant lecture/import : profil, documents et notes privées de l’ancienne entreprise effacés. Les brouillons non synchronisés de la même entreprise et la première connexion restent préservés. Trois tests couvrent ces situations. |
| SEC-14 | Haute | Le préfixe brut d’un chemin photo ne suffisait pas à empêcher une sortie de dossier par `..` ou son encodage, lors de la signature privilégiée d’un lien. | Contrôle du chemin effectif avant signature, suppression ou upload côté serveur. Une référence empoisonnée est refusée avant l’appel Storage ; une photo normale reste accessible. Les références SQL de fichiers sont également bornées à leur entreprise et excluent les traversées de dossier. |

## Protections contrôlées et conservées

- Les **36 tables publiques** ont RLS activé. Aucune vue publique n’a été trouvée lors de l’inspection.
- Les trois buckets inspectés sont privés : photos de chantier, pièces jointes d’activité, documents partagés. Limites de taille et listes de types MIME sont présentes. Les documents PDF partagés utilisent un lien signé limité à sept jours ; une personne qui reçoit ce lien peut le retransmettre pendant sa validité.
- Les opérations financières vérifient les rôles côté serveur et côté base. La création normale d’une entreprise, l’enregistrement d’un devis et les notes d’un salarié sur son chantier restent possibles.
- Les six fonctions métier privilégiées ont leur implémentation déplacée dans le schéma privé. Les contrats RPC publics restent disponibles via des fonctions sans privilèges élevés, qui appellent les implémentations contrôlées. Les six alertes d’exposition correspondantes ont disparu.
- Les clés de service Vercel inspectées sont déclarées sensibles et restent côté serveur. Les variables de test n’étaient pas activées en production ; un garde de build empêche leur activation accidentelle dans un déploiement Vercel de production.
- Les previews Vercel sont protégées par SSO selon les métadonnées du projet. Aucun mot de passe de déploiement ni restriction IP spécifique n’est configuré ; cela ne rend pas l’application publique commerciale anormale.
- Chiffrement des jetons de facturation électronique avec AES-GCM, état OAuth signé et expirant, rôle propriétaire/administrateur recontrôlé au retour. Les secrets des fournisseurs ne sont pas retournés au navigateur. L’usage réel du fournisseur doit encore être validé lors du branchement hors sandbox.
- Sources envoyées à l’IA limitées aux données inline validées ; pas d’URL d’image arbitraire à faire charger au fournisseur. Les appels réseau sensibles utilisent des destinations fixes et des délais maximum.
- Les sorties affichées utilisent React ou des fragments HTML fixes dans les emplacements inspectés. Aucun texte client non échappé n’a été identifié dans les insertions HTML examinées. La CSP ajoute une protection sans remplacer l’échappement.
- Le service worker exclut les API et les requêtes avec Authorization. Il ne conserve plus les navigations de récupération de mot de passe, les codes OAuth ou les URL avec paramètres dans le cache de l’accueil.
- Les demandes mutantes depuis une origine étrangère sont refusées, y compris si un en-tête prétend « same-origin ». Le Host public est utilisé pour éviter les faux refus liés à la normalisation interne de Next ; les sessions restent vérifiées par les API.
- Les contrôles de signatures, d’envoi, de confirmation humaine, de destinataire et d’idempotence des actions ont été examinés. Les tests de messagerie utilisent des fournisseurs simulés.

## Vérifications reproductibles

| Contrôle | Évidence |
| --- | --- |
| TypeScript | `tsc --noEmit` |
| Régression et attaques API | `node --import tsx --test tests/*.test.ts` ; le fichier `tests/security-audit.test.ts` exerce les refus et vérifie l’absence d’effets privilégiés. |
| Permissions réelles | `supabase/tests/security-audit.sql` : propriétaire, administrateur, bureau, chef d’équipe, salarié, comptable, personne extérieure et nouvelle inscription ; contrôle des quotas, accès croisés, sessions expirées/révoquées et écriture normale. Résultat : « security matrix passed; all fixtures rolled back ». |
| Nettoyage des fixtures | Compte agrégé des utilisateurs d’audit persistants : **0**. |
| Dépendances | Audit npm complet local : **0 vulnérabilité connue**, développement inclus. Le correctif Sharp était déjà installé avant cet audit. |
| Secrets dans le dépôt | 493 fichiers suivis et 845 commits locaux inspectés par motifs de clés privées et contrôle des JWT ; aucun secret correspondant identifié. Ce contrôle par motifs ne prouve pas l’absence de tout type de secret. |
| Navigateur | Chromium et WebKit : CSP/nonce, refus des API anonymes, dictée, copilote, devis/factures, PDF, espace salarié et régressions métier. Résultats finaux consignés dans la CI du changement ; les cas réservés à un navigateur gardent leurs exclusions explicites. |
| Publication | Build de production, CI du dernier commit, puis vérification de la version de production et des réponses HTTP. Le statut final et le commit livré sont consignés dans la PR et le message de livraison. |

Les tests navigateur utilisent une base locale simulée et de fausses sessions. Ils ne valident pas les clés ou envois réels des fournisseurs. Les tests SQL, eux, ont été exécutés sur les permissions de la base de production dans une transaction annulée.

## Points restant à fermer avant le lancement commercial

| Point | État constaté / action nécessaire |
| --- | --- |
| Mots de passe compromis | **Alerte Supabase encore active.** Activer la protection dans Auth et vérifier qu’un mot de passe compromis est effectivement refusé. Le connecteur utilisé ne permet pas de modifier cette configuration ; aucun réglage n’a été annoncé comme activé. [Documentation officielle](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). |
| MFA et protection des inscriptions | État détaillé non vérifiable avec les opérations disponibles. Vérifier le MFA des comptes de plateforme et prévoir le second facteur pour les comptes administratifs de l’app ; vérifier confirmation d’e-mail, limites Auth et protection contre les inscriptions automatisées. Ne pas imposer un nouveau contrôle qui enfermerait les utilisateurs sans parcours d’enrôlement. [Checklist production Supabase](https://supabase.com/docs/guides/deployment/going-into-prod). |
| Sauvegardes et restauration | La rétention, le PITR et un exercice de restauration n’ont pas été validés. Vérifier les sauvegardes, puis restaurer dans un environnement isolé avant de considérer ce point fermé. Aucun test de restauration destructeur n’a été lancé sur la production. |
| Protection réseau et exploitation | L’API de configuration du firewall du projet Vercel ne retourne aucune configuration active. Cela ne permet pas d’attester les protections de plateforme. Vérifier les limites réseau, la supervision des erreurs, les alertes de coût et le plan de réponse à incident. Les quotas applicatifs ne remplacent pas une protection contre un déni de service volumétrique. |
| Pièces jointes externes | Les formats et tailles sont contrôlés et les buckets sont privés. Aucun antivirus/CDR n’est installé : les documents Office ou PDF externes restent des contenus à traiter comme non fiables. |
| Isolation des environnements | La clé de service inspectée est réservée à la production. Les previews ne doivent pas recevoir de données client ni de credentials de production pour reproduire les tests. Les appels payants échouent si la vérification serveur manque. |
| Fournisseurs réels et appareils | Confirmer les parcours avec les fournisseurs hors sandbox, les connexions OAuth réelles, et des iPhone/iPad/Android physiques. La simulation WebKit ne constitue pas une validation des applications natives. |
| Protection du dépôt | Les workflows examinés utilisent des actions principales figées sur des SHA et des permissions de lecture. Les règles de branche et l’état des alertes de sécurité GitHub n’ont pas été attestés avec les outils disponibles. Vérifier les protections de main et l’accès des mainteneurs. |

## Changements de comportement à connaître

- La dictée et le copilote nécessitent désormais une session connectée. Un salarié conserve la transcription et l’aide adaptées à son rôle ; il ne peut pas appeler l’IA financière directement.
- Un administrateur ne peut plus nommer ou modifier un autre administrateur, ni gérer les sessions du propriétaire. Le propriétaire conserve la gestion de l’équipe.
- Le comptable conserve la consultation des paiements et des documents ; l’enregistrement des paiements nécessite un rôle opérationnel.
- Un salarié ne reçoit que ses chantiers, notes et photos autorisés, sans catalogue financier ni historique commercial brut.
- Le HTML est rendu à chaque requête afin d’obtenir un nonce frais. Les fichiers statiques restent cachables. Les styles inline nécessaires à l’interface restent autorisés ; les scripts inline sans nonce et les attributs événementiels ne le sont pas.
- Les limites IA sont calibrées pour le pilote et doivent être suivies avec l’usage réel. Leur dépassement renvoie un message clair ; il ne déclenche pas un appel payant supplémentaire.

## Références

- [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/)
- [Sécurité produit Supabase](https://supabase.com/docs/guides/security/product-security)
- [Sécurisation de la Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [CSP et nonces Next.js](https://nextjs.org/docs/app/guides/content-security-policy)
- [Avertissements RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) : quatre informations subsistent volontairement pour des tables exclusivement serveur, dont le compteur privé. Ajouter une politique client pour effacer ces informations diminuerait la protection.
