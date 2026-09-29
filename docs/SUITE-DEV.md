# Passation : démarrer le développement de SkanEcom

> Écrit le 29/09/2026 à la fin de la session de cadrage, pour que la session suivante démarre sans rien reperdre.
> Branche de travail : `claude/gallant-hawking-gi9xv0` (seule branche du dépôt, donc branche par défaut).

## Où on en est

- **Modèle** : boutique en ligne clé en main, en marque blanche, pour 10 à 50 entreprises (décision D15). Voir [`cadrage/01-prd.md`](cadrage/01-prd.md).
- **Hébergement** : Cloudflare (domaines, application Next.js sur Workers via vinext, cache, R2, files) et Supabase (Postgres + Auth, Paris). Voir [`cadrage/02-infrastructure.md`](cadrage/02-infrastructure.md).
- **Clients, dans l'ordre** : Maymar, puis le représentant DeWalt, puis la quincaillerie. Modules décidés dans [`cadrage/05-etude-outillage-quincaillerie.md`](cadrage/05-etude-outillage-quincaillerie.md).
- **Prototype : réussi** en local le 28/09 et chez Cloudflare le 29/09. Les pages déjà vues restent servies pendant une panne de la base, et deux domaines ne reçoivent jamais la page de l'autre. Voir [`../prototype/vitrine-workers/RAPPORT.md`](../prototype/vitrine-workers/RAPPORT.md). Les Workers de test sont supprimés ; le workflow les redéploie en 2 minutes.

## État des accès

| Accès | État au 29/09 | Ce qu'il débloque |
|---|---|---|
| Secrets GitHub `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` | **Ajoutés le 29/09.** Jeton valable un mois ; il peut modifier tous les Workers du compte, le workflow ne touche qu'aux quatre Workers du prototype | Workflow `prototype-vitrine.yml` : déploiements de test sur Cloudflare |
| Organisation Supabase « SkanEcom » visible par le connecteur | Manquante (le connecteur ne voyait que « Lemonbeach »). **Pas bloquant pour l'étape 1** : on développe sur un Postgres local | Base dans le cloud, nécessaire avant la mise en ligne de Maymar (étape 2) |
| Bucket R2 `skanecom-prototype-vitrine-response-store-cache-bodies` | Gardé (quelques pages factices, gratuit) | Cache de la vitrine du prototype, si on relance la phase 2 |
| Réseau de l'environnement vers `*.supabase.co`, `api.cloudflare.com` et `*.workers.dev` | Bloqué (facultatif) : on passe par GitHub Actions | Tests directs depuis le conteneur |

## Premières tâches de l'étape 1 (socle), dans l'ordre

1. ~~Phase 2 du prototype~~ : **faite le 29/09**. Il reste la mesure depuis la Tunisie, à faire quand Skander le souhaite (`deployer`, ouvrir la vitrine sur un téléphone, puis `supprimer`).
2. **Base locale d'abord** (décision de Skander, 29/09) : Postgres local avec les éléments Supabase simulés (`auth.users`, `auth.uid()`, rôles `anon` et `authenticated`), comme pour le prototype. Si Docker est disponible, utiliser `supabase start` pour avoir aussi Auth et l'API REST. On passe au projet Supabase SkanEcom dans le cloud (région `eu-west-3`) avant l'étape 2. Migrations multi-boutique à partir de celles de Maymar, en appliquant `cadrage/03-reprise-maymar.md` :
   - `boutique_id` partout, clés étrangères composites ;
   - `private.est_membre()` ;
   - unicités par boutique, compteur de commandes par boutique ;
   - réglages et zones par boutique ;
   - tables de la console.
3. **Tests d'isolation pgTAP**, bloquants dans l'intégration continue.
4. **Application** : à partir de `prototype/vitrine-workers` :
   - trouver la boutique à partir du domaine et réécrire l'adresse en interne (`/_b/<boutique>/…`, dossier `src/app/%5Fb/[boutique]/`, modèle : `prototype/vitrine-workers/src/proxy.ts`) ;
   - thème par jetons `--theme-*` lus dans la base ;
   - `generateStaticParams` sur les routes dynamiques ;
   - catalogue filtré en base ;
   - **pages à filtres en cache** (catalogue, rayon, recherche) : c'est la découverte n°8 du prototype, à trancher dans le thème ;
   - **client Supabase de la vitrine qui abandonne vite** : `db: { retry: false, timeout: 2000 }` (découverte n°7) ;
   - **déploiement en deux temps avec cache prérempli** (`--warm-cache`), et nettoyage des anciennes versions du cache (découverte n°6).
5. **Console minimale** : créer une boutique, régler sa marque, importer un fichier Excel.
6. **Maymar migrée** comme première boutique ; domaine `maymar.tn` à l'étape 2.

## Règles à tenir

- Un seul code et une seule base ; **jamais de copie ni de code spécifique à un client** (PRD §4.3).
- Tout choix défendable devient un réglage.
- Aucune donnée personnelle dans KV ni dans les journaux ; sauvegardes et tampons dans l'UE.
